import { findCard } from '@/data/activities'
import { slotIndexFromDate, slotIndexFromMinutes, slotMinuteRange } from '@/domain/slots'
import {
  clampDuration,
  clampMove,
  clampResizeStart,
  clampStepDuration,
  commitSchedule,
  computeCandidateSchedule,
  maxContiguousDuration,
  validateSchedule,
  type CandidateSchedule,
} from '@/domain/scheduling'
import type { ActivityQuality, FlagId, ScheduledActivity, Symptom } from '@/domain/types'

/**
 * What is currently staged in the modal but not yet committed. Nothing here
 * has touched `activities` — Save is the only commit point.
 */
export interface StagingState {
  cardName: string | null
  /** Drill-down path so far, e.g. ["Oiling"] then ["Oiling", "Body"]. */
  path: string[]
  /** The real wall-clock anchor this placement would commit at. */
  startMinutes: number
  durationMinutes: number
  /**
   * Modal Redesign §E — single-select, "None" (null) the explicit default.
   * At most one, enforced entirely client-side (see `ScheduledActivity.flags`).
   */
  flag: FlagId | null
  /** "Activity quality" — optional multi-select (SCRUM-10). */
  quality: ActivityQuality[]
  /** "Chronic Symptoms" — optional multi-select, any number at once. */
  symptoms: Symptom[]
  /** Freeform notes textarea — optional, empty string is "nothing typed". */
  notes: string
  /**
   * Id of the activity being edited in place, or null when adding a new one.
   * Saving replaces that activity rather than appending a duplicate. Because
   * every activity now carries a stable id, editing no longer needs to track
   * a separate "which slot is this really anchored at" field the way the old
   * slot-indexed model did — the id alone finds it, wherever it starts.
   */
  editingId: string | null
}

/** A just-removed activity, held briefly so it can be undone. */
export interface RemovalRecord {
  activity: ScheduledActivity
}

export interface BoardState {
  activities: ScheduledActivity[]
  selectedSlot: number
  staging: StagingState
  removal: RemovalRecord | null
  /**
   * Id of the activity currently shown in `SlotEditor`'s read-only Activity
   * summary view, or null when nothing has been clicked yet (or the thing
   * that was being viewed no longer resolves). Entirely separate from
   * `staging.editingId` — viewing a summary never opens `LogActivityModal`;
   * only the summary's own Edit button (`editActivity`) does that. Set by
   * `selectActivity`, cleared by a standalone `selectSlot` and by removing
   * the activity it names.
   */
  viewingActivityId: string | null
}

export const EMPTY_STAGING: StagingState = {
  cardName: null,
  path: [],
  startMinutes: 0,
  durationMinutes: 0,
  flag: null,
  quality: [],
  symptoms: [],
  notes: '',
  editingId: null,
}

export type BoardAction =
  | { type: 'selectSlot'; slot: number }
  | { type: 'pickCard'; cardName: string }
  | { type: 'pickOption'; level: number; value: string }
  | { type: 'crumbBack' }
  | { type: 'cancelStaging' }
  | { type: 'stepDuration'; delta: number }
  /**
   * An exact duration from free-form entry or a quick-add button. Unlike
   * `stepDuration`, this never snaps to the stepper's 5-minute grid — it
   * clamps only to [MIN_DURATION_MINUTES, ceiling] (rule 13), then flows
   * through the same `commit` pipeline as every other staged duration.
   */
  | { type: 'setDuration'; minutes: number }
  /**
   * Duration drag-block — moving the whole pill: an absolute target start,
   * duration held fixed, clamped to `moveBounds` (rule 1's hard-stop). Used
   * identically by pointer drag (target computed from the total pixel delta
   * since the drag began) and by the pill's own keyboard arrows (target =
   * current +/- the 5-minute step) — one action, two input methods.
   */
  | { type: 'setStagingStart'; minutes: number }
  /**
   * Duration drag-block — resizing from the START handle: the END stays
   * fixed, the start (and therefore duration) changes, clamped to
   * `resizeStartBounds`. The END handle needs no new action — it's exactly
   * `setDuration`/`stepDuration` (start fixed, duration changes), reused.
   */
  | { type: 'resizeStagingStart'; minutes: number }
  | { type: 'setStagingFlag'; flag: FlagId | null }
  /** Multi-select toggle — adds the quality if absent, removes it if present. */
  | { type: 'toggleStagingQuality'; quality: ActivityQuality }
  /** Multi-select toggle — adds the symptom if absent, removes it if present. */
  | { type: 'toggleStagingSymptom'; symptom: Symptom }
  | { type: 'setStagingNotes'; notes: string }
  | { type: 'commit' }
  | { type: 'editActivity'; id: string }
  | { type: 'removeActivity'; id: string }
  | { type: 'undoRemoval' }
  | { type: 'dismissRemoval'; id: string }
  | { type: 'dropCard'; cardName: string; slot: number }
  | { type: 'hydrate'; activities: ScheduledActivity[] }
  | { type: 'toggleComplete'; id: string }
  /**
   * Clicking (or keyboard-activating) an activity's own rendered segment on
   * the Timeline strip — see `components/Timeline.tsx`. Defined as exactly
   * what the manual flow does, the same precedent `dropCard` already sets:
   * select the slot the activity starts in, then open it for edit — so this
   * inherits `editActivity`'s guard (unknown id, or a flag-only marker,
   * leaves the state untouched) verbatim, and can never drift from it.
   */
  | { type: 'selectActivity'; id: string }

/** Is the staged path deep enough to name a concrete leaf activity? */
export function isStagingComplete(staging: StagingState): boolean {
  if (!staging.cardName) return false
  const card = findCard(staging.cardName)
  if (!card) return false
  if (!card.sub) return true
  if (staging.path.length === 0) return false
  if (card.third) return staging.path.length >= 2
  return staging.path.length >= 1
}

/** Options to show for the current drill-down depth, or null at a leaf. */
export function stagingOptions(staging: StagingState): { options: string[]; level: number } | null {
  if (!staging.cardName) return null
  const card = findCard(staging.cardName)
  if (!card?.sub) return null
  if (staging.path.length === 0) return { options: card.sub, level: 0 }
  if (card.third && staging.path.length === 1) {
    const options = card.third[staging.path[0]]
    return options ? { options, level: 1 } : null
  }
  return null
}

export function createInitialState(activities: ScheduledActivity[], now: Date): BoardState {
  const selectedSlot = slotIndexFromDate(now)
  return {
    activities,
    selectedSlot,
    staging: EMPTY_STAGING,
    removal: null,
    viewingActivityId: null,
  }
}

function stageFrom(
  cardName: string,
  path: string[],
  candidate: CandidateSchedule,
): StagingState {
  return {
    cardName,
    path,
    startMinutes: candidate.startMinutes,
    durationMinutes: candidate.durationMinutes,
    flag: null,
    quality: [],
    symptoms: [],
    notes: '',
    editingId: candidate.id,
  }
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'selectSlot': {
      const slot = ((action.slot % 48) + 48) % 48
      if (slot === state.selectedSlot) {
        // Same slot, nothing staged for it changing hands — still clears
        // whatever activity summary was being viewed, since a standalone
        // `selectSlot` (the plain slot button) always means "back to Slot
        // view" (`selectActivity`'s own composition re-sets it immediately
        // after, same pattern `dropCard` already uses).
        if (state.viewingActivityId === null) return state
        return { ...state, viewingActivityId: null }
      }
      // Selecting a different slot abandons anything staged for the old one —
      // staged picks are scoped to a slot and were never committed.
      return { ...state, selectedSlot: slot, staging: EMPTY_STAGING, viewingActivityId: null }
    }

    case 'pickCard': {
      const card = findCard(action.cardName)
      if (!card) return state
      const { start, end } = slotMinuteRange(state.selectedSlot)
      const candidate = computeCandidateSchedule({ name: card.name, path: [] }, start, state.activities)
      // Refuse rather than silently anchoring somewhere past this grid cell's
      // own window — "add to THIS slot" must never land the activity in a
      // different, later cell just because the resolved free instant wandered
      // past it (`isWindowFull` in `SlotEditor` gates the picker UI on the
      // same condition, so the two never disagree).
      if (candidate.durationMinutes <= 0 || candidate.startMinutes >= end) return state
      return { ...state, staging: stageFrom(card.name, [], candidate) }
    }

    case 'pickOption': {
      const path = state.staging.path.slice(0, action.level)
      path[action.level] = action.value
      return { ...state, staging: { ...state.staging, path } }
    }

    case 'crumbBack': {
      if (state.staging.path.length > 0) {
        return {
          ...state,
          staging: { ...state.staging, path: state.staging.path.slice(0, -1) },
        }
      }
      return { ...state, staging: EMPTY_STAGING }
    }

    case 'cancelStaging':
      // Clears the not-yet-added pick only. Never touches committed activities.
      return { ...state, staging: EMPTY_STAGING }

    case 'stepDuration': {
      if (!state.staging.cardName) return state
      const ceiling = maxContiguousDuration(
        state.activities,
        state.staging.startMinutes,
        state.staging.editingId,
      )
      // The stepper's own floor (DURATION_STEP_MINUTES, 5) — never the
      // domain-wide MIN_DURATION_MINUTES (1) that free-form entry uses — so
      // every +/-5 click lands back on a multiple of 5. See `clampStepDuration`.
      const next = clampStepDuration(state.staging.durationMinutes + action.delta, ceiling)
      if (next === state.staging.durationMinutes) return state
      return { ...state, staging: { ...state.staging, durationMinutes: next } }
    }

    /**
     * R2.3/R2.4 — free-form manual entry and the additive quick-add buttons
     * both land here with the exact target minutes; the general `clampDuration`
     * (floor 1, no grid snapping) is what makes the typed value commit exactly
     * as entered rather than rounding to the stepper's 5-minute grid, while
     * still respecting the same overlap/continuous-block ceiling.
     */
    case 'setDuration': {
      if (!state.staging.cardName) return state
      const ceiling = maxContiguousDuration(
        state.activities,
        state.staging.startMinutes,
        state.staging.editingId,
      )
      const next = clampDuration(action.minutes, ceiling)
      if (next === state.staging.durationMinutes) return state
      return { ...state, staging: { ...state.staging, durationMinutes: next } }
    }

    case 'setStagingStart': {
      if (!state.staging.cardName) return state
      const next = clampMove(
        state.activities,
        state.staging.startMinutes,
        state.staging.durationMinutes,
        action.minutes,
        state.staging.editingId,
      )
      if (next === state.staging.startMinutes) return state
      return { ...state, staging: { ...state.staging, startMinutes: next } }
    }

    case 'resizeStagingStart': {
      if (!state.staging.cardName) return state
      const currentEnd = state.staging.startMinutes + state.staging.durationMinutes
      const next = clampResizeStart(
        state.activities,
        state.staging.startMinutes,
        currentEnd,
        action.minutes,
        state.staging.editingId,
      )
      if (next === state.staging.startMinutes) return state
      return {
        ...state,
        staging: { ...state.staging, startMinutes: next, durationMinutes: currentEnd - next },
      }
    }

    case 'setStagingFlag': {
      if (!state.staging.cardName) return state
      if (state.staging.flag === action.flag) return state
      return { ...state, staging: { ...state.staging, flag: action.flag } }
    }

    case 'toggleStagingQuality': {
      if (!state.staging.cardName) return state
      const { quality } = state.staging
      const next = quality.includes(action.quality)
        ? quality.filter((q) => q !== action.quality)
        : [...quality, action.quality]
      return { ...state, staging: { ...state.staging, quality: next } }
    }

    case 'toggleStagingSymptom': {
      if (!state.staging.cardName) return state
      const { symptoms } = state.staging
      const next = symptoms.includes(action.symptom)
        ? symptoms.filter((s) => s !== action.symptom)
        : [...symptoms, action.symptom]
      return { ...state, staging: { ...state.staging, symptoms: next } }
    }

    case 'setStagingNotes': {
      if (!state.staging.cardName) return state
      if (state.staging.notes === action.notes) return state
      return { ...state, staging: { ...state.staging, notes: action.notes } }
    }

    case 'commit': {
      const { staging } = state
      if (!staging.cardName || !isStagingComplete(staging)) return state

      const candidate: CandidateSchedule = {
        id: staging.editingId,
        activity: { name: staging.cardName, path: [...staging.path] },
        startMinutes: staging.startMinutes,
        durationMinutes: staging.durationMinutes,
      }
      const validation = validateSchedule(candidate, state.activities)
      if (!validation.ok) return state

      const prior = staging.editingId
        ? state.activities.find((a) => a.id === staging.editingId)
        : undefined

      // Rule 4: editing time/duration never silently clears completion — the
      // prior status and timezone always carry forward untouched. Flags,
      // quality, symptoms and notes, unlike status, ARE editable from this
      // same modal (Modal Redesign §B/§D/§E) — staging's own values are what
      // the user just set there (defaulted from the prior activity's own
      // values by `editActivity` below, so "didn't touch it" round-trips
      // unchanged). An empty notes textarea commits as `null`, not `''` —
      // "nothing typed" and "no notes" are the same state, never a stored
      // empty string.
      const committed = commitSchedule(candidate, {
        id: prior?.id,
        flags: staging.flag ? [staging.flag] : [],
        quality: staging.quality,
        symptoms: staging.symptoms,
        notes: staging.notes.trim() ? staging.notes : null,
        status: prior?.status ?? 'planned',
        timezone: prior?.timezone,
      })

      const activities = prior
        ? state.activities.map((a) => (a.id === committed.id ? committed : a))
        : [...state.activities, committed]

      return { ...state, activities, staging: EMPTY_STAGING }
    }

    case 'editActivity': {
      const activity = state.activities.find((a) => a.id === action.id)
      if (!activity || activity.name === null) return state
      return {
        ...state,
        staging: {
          cardName: activity.name,
          path: [...activity.path],
          startMinutes: activity.startMinutes,
          durationMinutes: activity.durationMinutes,
          // At most one flag is ever staged (single-select) even if a
          // pre-existing row somehow carries more (see the ScheduledActivity
          // `flags` doc comment) — the first is kept, the rest are dropped
          // only if the user goes on to Save; Cancel leaves the row untouched.
          flag: activity.flags[0] ?? null,
          quality: [...activity.quality],
          symptoms: [...activity.symptoms],
          notes: activity.notes ?? '',
          editingId: activity.id,
        },
      }
    }

    case 'removeActivity': {
      const activity = state.activities.find((a) => a.id === action.id)
      if (!activity) return state
      return {
        ...state,
        activities: state.activities.filter((a) => a.id !== action.id),
        // Editing the removed activity is no longer meaningful.
        staging: state.staging.editingId === action.id ? EMPTY_STAGING : state.staging,
        // Nor is viewing its summary.
        viewingActivityId: state.viewingActivityId === action.id ? null : state.viewingActivityId,
        removal: { activity },
      }
    }

    case 'undoRemoval': {
      const { removal } = state
      if (!removal) return state
      const { activity } = removal

      // Belt and braces: restoring must never be the one path that can
      // reintroduce an overlap every other path forbids. If something has
      // since taken this activity's exact time range, the restore is
      // discarded rather than applied — the honest outcome, since the thing
      // it would undo no longer has room.
      const candidate: CandidateSchedule = {
        id: null,
        activity: activity.name !== null ? { name: activity.name, path: activity.path } : null,
        startMinutes: activity.startMinutes,
        durationMinutes: activity.durationMinutes,
      }
      if (!validateSchedule(candidate, state.activities).ok) {
        return { ...state, removal: null }
      }

      return { ...state, activities: [...state.activities, activity], removal: null }
    }

    case 'dismissRemoval':
      if (state.removal?.activity.id !== action.id) return state
      return { ...state, removal: null }

    /**
     * A DROP NEVER COMMITS.
     *
     * Defined as exactly what the manual flow does: select the dropped slot,
     * then pick that card — so the drop inherits slot resolution, the
     * default duration, the overlap/continuous-ceiling rules and the
     * conflict handling verbatim, and can never drift from them.
     */
    case 'dropCard': {
      const selected = boardReducer(state, { type: 'selectSlot', slot: action.slot })
      return boardReducer(selected, { type: 'pickCard', cardName: action.cardName })
    }

    /**
     * Replaces `activities` wholesale with the server's authoritative view —
     * the one-time reconciliation `BoardContext` performs after a cold load
     * signs in and fetches "today" (rule 8's bounded window). Deliberately
     * NOT a general merge: Phase 2's local-first write is "instant local,
     * background sync"; reconciling a genuinely concurrent local edit made
     * while this fetch was in flight against the server's answer is Phase
     * 5's last-write-wins hardening (rule 7), out of scope here. Clears any
     * staged pick and pending removal, since both reference activities by id
     * that this swap may have just invalidated.
     */
    case 'hydrate':
      return { ...state, activities: action.activities, staging: EMPTY_STAGING, removal: null }

    /**
     * Phase 3 — planned vs. actual. Toggling completion NEVER touches
     * start/duration/path/flags (the mirror image of rule 4: a status change
     * must be just as surgical as a reschedule is required to be), so it is
     * deliberately its own action rather than routed through `commit`.
     */
    case 'toggleComplete': {
      const activity = state.activities.find((a) => a.id === action.id)
      if (!activity || activity.name === null) return state
      const status = activity.status === 'completed' ? 'planned' : 'completed'
      return {
        ...state,
        activities: state.activities.map((a) => (a.id === action.id ? { ...a, status } : a)),
      }
    }

    /**
     * Clicking (or keyboard-activating) an activity's own rendered segment on
     * the Timeline strip no longer jumps straight into `LogActivityModal` —
     * it only selects the activity's own start slot for context (composing
     * `selectSlot`, the exact precedent `dropCard` already sets) and records
     * which activity `SlotEditor`'s Activity-summary view should show,
     * WITHOUT touching `staging` — the modal only ever opens from that
     * summary's own explicit Edit button (`editActivity`), unchanged. Guard
     * early (unknown id, or a flag-only marker — `name === null`) without
     * touching `selectedSlot`, mirroring `editActivity`'s own guard exactly.
     */
    case 'selectActivity': {
      const activity = state.activities.find((a) => a.id === action.id)
      if (!activity || activity.name === null) return state
      const selected = boardReducer(state, {
        type: 'selectSlot',
        slot: slotIndexFromMinutes(activity.startMinutes),
      })
      return { ...selected, viewingActivityId: action.id }
    }

    default:
      return state
  }
}
