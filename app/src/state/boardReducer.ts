import { findCard } from '@/data/activities'
import { slotIndexFromDate } from '@/domain/slots'
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
import {
  activityBoardStart,
  boardStartToStorage,
  isoOfDate,
  slotBoardRange,
  toBoardActivities,
} from '@/domain/window'
import { currentWindowDate } from '@/lib/localTime'
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
  /**
   * `YYYY-MM-DD` of the 6am-to-6am window this board is showing (see
   * `lib/localTime.ts` `windowRange` / `domain/window.ts`). Every geometry
   * and scheduling computation in this reducer maps `activities` into
   * board-minute space for THIS window before touching `domain/scheduling.ts`
   * or `domain/slots.ts`, and converts a freshly placed activity's board
   * minute back to `{ localDate, startMinutes }` for storage. Set at init and
   * replaced by `hydrate` (never by `selectSlot` — that only moves the grid
   * cursor within the same window).
   */
  viewedDate: string
  selectedSlot: number
  staging: StagingState
  removal: RemovalRecord | null
  /**
   * Id of the scheduled activity currently selected for VIEWING (a read-only
   * details summary — quality/symptoms/protective response/notes/reflection
   * cards already mapped) and as the target for reflection-card mapping —
   * see `selectScheduledActivity`/`mapReflectionCard` below.
   *
   * This is the "activity mode" half of the timeline's two-mode click model:
   * clicking an activity (or a fully-covered slot) selects it here and Frame
   * 1 (`SlotEditor`) swaps its whole body for that activity's summary;
   * clicking an empty slot selects a slot instead and clears this. The two
   * are mutually exclusive by construction — every `selectSlot` clears this,
   * and `selectScheduledActivity` never touches `selectedSlot`/`staging`
   * (which stay as they were, purely so the light/dark theme and the "Now"
   * badge still have a slot to derive from). `editActivity` is the one
   * deliberate exception: editing FROM the summary keeps this set so the log
   * modal opens over the summary and returns to it on save/cancel.
   */
  selectedActivityId: string | null
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
  | { type: 'hydrate'; activities: ScheduledActivity[]; viewedDate: string }
  | { type: 'toggleComplete'; id: string }
  /**
   * Clicking (or keyboard-activating) an activity's own rendered segment on
   * the Timeline strip — see `components/Timeline.tsx`. Selects it for
   * VIEWING (`selectedActivityId`) — a read-only details summary, and the
   * target for reflection-card mapping (`mapReflectionCard`) — it does NOT
   * open the edit modal (that stays reachable via `editActivity`, e.g. from
   * `SlotActivityList`'s own edit control). Clicking the already-selected
   * activity again deselects it (toggle); selecting a different one, or an
   * unknown id, or a flag-only marker (`name === null`) leaves the OLD
   * selection cleared/replaced as appropriate rather than silently no-oping,
   * since "nothing found" should never leave a stale id selected.
   */
  | { type: 'selectScheduledActivity'; id: string | null }
  /**
   * Maps a reflection card onto an already-logged activity, with its own
   * note — deliberately NOT part of logging/editing that activity (`commit`
   * never touches `reflections`): the product decision is that reflection
   * mapping happens later, possibly hours after the activity was logged, via
   * either clicking a card in the reflection grid while an activity is
   * selected, or dragging a card directly onto an activity's timeline
   * segment. Adding a second/third card, or re-mapping an already-mapped
   * card with a new note, is normal usage — this always overwrites that one
   * pairing's note, never the activity's other reflections.
   */
  | { type: 'mapReflectionCard'; scheduledActivityId: string; card: number; note: string }
  /** The inverse of `mapReflectionCard` — drops one pairing, leaving every other reflection on the activity untouched. */
  | { type: 'unmapReflectionCard'; scheduledActivityId: string; card: number }
  /**
   * A quick-log entry (Sun/Moon exposure, Vipassana — `entry_mode:
   * 'quick_log'` catalog activities) — an exact start/end clock time typed
   * directly into that control's own popover, never the tile-row/staging
   * modal. Always creates a NEW activity (these are logged as multiple
   * sessions per day, never edited in place from here); the caller
   * (`DisplayValueButton`/`SunMoonLogPopover`) is expected to have already
   * validated the exact requested placement with `validateSchedule` itself
   * so it can show an inline conflict error instead of a silent no-op — this
   * re-validates anyway (belt and braces, same reasoning `commit` re-checks
   * a staged candidate that was already validated when it was computed).
   */
  | { type: 'quickLogActivity'; cardName: string; startMinutes: number; durationMinutes: number }

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

export function createInitialState(
  activities: ScheduledActivity[],
  now: Date,
  viewedDate: string = isoOfDate(currentWindowDate(now)),
): BoardState {
  const selectedSlot = slotIndexFromDate(now)
  return {
    activities,
    viewedDate,
    selectedSlot,
    staging: EMPTY_STAGING,
    removal: null,
    selectedActivityId: null,
  }
}

/** Every activity mapped into board-minute space for `state.viewedDate`. */
function boardActivities(state: BoardState): ScheduledActivity[] {
  return toBoardActivities(state.activities, state.viewedDate)
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
      // Selecting a slot is the "slot mode" gesture — it always clears any
      // activity that was selected for viewing (the two modes are mutually
      // exclusive: Frame 1 shows EITHER the slot's tile row OR a selected
      // activity's summary, never both). A same-slot click while an activity
      // is selected still has to fall through here to do that clearing.
      if (slot === state.selectedSlot && state.selectedActivityId === null) return state
      // Selecting a different slot also abandons anything staged for the old
      // one — staged picks are scoped to a slot and were never committed.
      return { ...state, selectedSlot: slot, staging: EMPTY_STAGING, selectedActivityId: null }
    }

    case 'pickCard': {
      const card = findCard(action.cardName)
      if (!card) return state
      const { start, end } = slotBoardRange(state.selectedSlot)
      const candidate = computeCandidateSchedule({ name: card.name, path: [] }, start, boardActivities(state))
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
        boardActivities(state),
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
        boardActivities(state),
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
        boardActivities(state),
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
        boardActivities(state),
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
        // `staging.startMinutes` is a BOARD minute for the current window
        // (`domain/window.ts`) — validated in that same space, then split back
        // into `{ localDate, startMinutes }` for storage after the commit.
        startMinutes: staging.startMinutes,
        durationMinutes: staging.durationMinutes,
      }
      const validation = validateSchedule(candidate, boardActivities(state))
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
      // empty string. Reflections are NEVER part of this modal (a later,
      // separate action — see `mapReflectionCard`/`unmapReflectionCard`), so
      // committing a time/duration/quality/etc. edit always carries the
      // activity's EXISTING reflections forward untouched, the same rule-4
      // guarantee status/timezone already have.
      const boardCommitted = commitSchedule(candidate, {
        id: prior?.id,
        flags: staging.flag ? [staging.flag] : [],
        quality: staging.quality,
        symptoms: staging.symptoms,
        notes: staging.notes.trim() ? staging.notes : null,
        reflections: prior?.reflections ?? [],
        status: prior?.status ?? 'planned',
        timezone: prior?.timezone,
      })
      // Board minute -> the calendar day + minutes-since-its-midnight actually
      // stored. A placement in the night row's small hours resolves to the
      // NEXT calendar day (localDate = viewedDate + 1).
      const { localDate, startMinutes } = boardStartToStorage(
        boardCommitted.startMinutes,
        state.viewedDate,
      )
      const committed = { ...boardCommitted, localDate, startMinutes }

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
          // Staging works in board-minute space for the current window (so the
          // drag-block / stepper share one axis with `pickCard`); `commit`
          // converts back. A small-hours activity (localDate = viewedDate + 1)
          // loads here at board minute 1440+.
          startMinutes: activityBoardStart(activity, state.viewedDate),
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
        // Editing (or viewing/mapping reflections onto) the removed activity
        // is no longer meaningful.
        staging: state.staging.editingId === action.id ? EMPTY_STAGING : state.staging,
        selectedActivityId: state.selectedActivityId === action.id ? null : state.selectedActivityId,
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
        // Re-check in board space — the removed activity may have belonged to
        // the next calendar day (small hours), so its board minute is what has
        // to be free.
        startMinutes: activityBoardStart(activity, state.viewedDate),
        durationMinutes: activity.durationMinutes,
      }
      if (!validateSchedule(candidate, boardActivities(state)).ok) {
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
     * that this swap may have just invalidated (and the selected-activity
     * viewing/mapping target, for the same reason).
     */
    case 'hydrate':
      return {
        ...state,
        activities: action.activities,
        viewedDate: action.viewedDate,
        staging: EMPTY_STAGING,
        removal: null,
        selectedActivityId: null,
      }

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
     * Selects an activity for VIEWING/reflection-mapping — never opens the
     * edit modal (that's `editActivity`, unchanged, still reachable from
     * `SlotActivityList`). `action.id === null` always clears the selection
     * outright; clicking the ALREADY-selected activity again also clears it
     * (a click-to-toggle affordance); an unknown id or a flag-only marker
     * (`name === null`, nothing to view) leaves the selection untouched
     * rather than pointing it at something with no details to show.
     */
    case 'selectScheduledActivity': {
      if (action.id === null) {
        return state.selectedActivityId === null ? state : { ...state, selectedActivityId: null }
      }
      if (action.id === state.selectedActivityId) {
        return { ...state, selectedActivityId: null }
      }
      const activity = state.activities.find((a) => a.id === action.id)
      if (!activity || activity.name === null) return state
      return { ...state, selectedActivityId: action.id }
    }

    /**
     * Reflection mapping — a later, separate action from logging/editing an
     * activity (see the action's own doc comment above). Replaces any prior
     * pairing for the SAME card (overwriting just its note), leaving every
     * other reflection on the activity untouched; a card is otherwise
     * appended. Silently no-ops for an unknown activity id rather than
     * throwing — the UI is expected to only ever call this with an id it
     * just read off `state.activities` itself.
     */
    case 'mapReflectionCard': {
      const activity = state.activities.find((a) => a.id === action.scheduledActivityId)
      if (!activity) return state
      const withoutCard = activity.reflections.filter((r) => r.card !== action.card)
      const updated = { ...activity, reflections: [...withoutCard, { card: action.card, note: action.note }] }
      return {
        ...state,
        activities: state.activities.map((a) => (a.id === activity.id ? updated : a)),
      }
    }

    /** The inverse of `mapReflectionCard` — drops one pairing only. No-ops if the activity or that pairing isn't found. */
    case 'unmapReflectionCard': {
      const activity = state.activities.find((a) => a.id === action.scheduledActivityId)
      if (!activity) return state
      if (!activity.reflections.some((r) => r.card === action.card)) return state
      const updated = { ...activity, reflections: activity.reflections.filter((r) => r.card !== action.card) }
      return {
        ...state,
        activities: state.activities.map((a) => (a.id === activity.id ? updated : a)),
      }
    }

    case 'quickLogActivity': {
      // `action.startMinutes` is a BOARD minute for the current window (the
      // caller — `SunMoonLogPopover` / `DisplayValueButton` — resolves its
      // typed clock time through `domain/window.ts` the same way the tile-row
      // flow does).
      const candidate: CandidateSchedule = {
        id: null,
        activity: { name: action.cardName, path: [] },
        startMinutes: action.startMinutes,
        durationMinutes: action.durationMinutes,
      }
      if (!validateSchedule(candidate, boardActivities(state)).ok) return state
      const boardCommitted = commitSchedule(candidate)
      const { localDate, startMinutes } = boardStartToStorage(
        boardCommitted.startMinutes,
        state.viewedDate,
      )
      return {
        ...state,
        activities: [...state.activities, { ...boardCommitted, localDate, startMinutes }],
      }
    }

    default:
      return state
  }
}
