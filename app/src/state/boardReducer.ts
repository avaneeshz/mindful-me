import { findCard } from '@/data/activities'
import { flagMarkerAt, periodOfSlot, slotIndexFromDate, slotMinuteRange } from '@/domain/slots'
import {
  clampDuration,
  commitSchedule,
  computeCandidateSchedule,
  generateId,
  maxContiguousDuration,
  validateSchedule,
  type CandidateSchedule,
} from '@/domain/scheduling'
import type { FlagId, Period, ScheduledActivity } from '@/domain/types'

/**
 * What is currently staged in the right-hand pane but not yet committed.
 * Nothing here has touched `activities` — Add/Save is the only commit point.
 */
export interface StagingState {
  cardName: string | null
  /** Drill-down path so far, e.g. ["Oiling"] then ["Oiling", "Body"]. */
  path: string[]
  /** The real wall-clock anchor this placement would commit at. */
  startMinutes: number
  durationMinutes: number
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
   * Which segment of the period navigator is focused. This is presentation
   * only: it NEVER hides, dims or disables the other timeline row, and it is
   * independent of `selectedSlot`.
   */
  focusedPeriod: Period
  /** Bumped on every period jump so the target row can replay its pulse. */
  jump: { period: Period; token: number } | null
}

export const EMPTY_STAGING: StagingState = {
  cardName: null,
  path: [],
  startMinutes: 0,
  durationMinutes: 0,
  editingId: null,
}

export type BoardAction =
  | { type: 'selectSlot'; slot: number }
  | { type: 'focusPeriod'; period: Period }
  | { type: 'pickCard'; cardName: string }
  | { type: 'pickOption'; level: number; value: string }
  | { type: 'crumbBack' }
  | { type: 'cancelStaging' }
  | { type: 'stepDuration'; delta: number }
  | { type: 'commit' }
  | { type: 'editActivity'; id: string }
  | { type: 'removeActivity'; id: string }
  | { type: 'undoRemoval' }
  | { type: 'dismissRemoval'; id: string }
  | { type: 'toggleFlag'; flag: FlagId }
  | { type: 'dropCard'; cardName: string; slot: number }
  | { type: 'hydrate'; activities: ScheduledActivity[] }

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
    focusedPeriod: periodOfSlot(selectedSlot),
    jump: null,
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
    editingId: candidate.id,
  }
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'selectSlot': {
      const slot = ((action.slot % 48) + 48) % 48
      if (slot === state.selectedSlot) return state
      // Selecting a different slot abandons anything staged for the old one —
      // staged picks are scoped to a slot and were never committed.
      return { ...state, selectedSlot: slot, staging: EMPTY_STAGING }
    }

    case 'focusPeriod': {
      // Presentation-only. Deliberately does not touch selectedSlot.
      return {
        ...state,
        focusedPeriod: action.period,
        jump: { period: action.period, token: (state.jump?.token ?? 0) + 1 },
      }
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
      const next = clampDuration(state.staging.durationMinutes + action.delta, ceiling)
      if (next === state.staging.durationMinutes) return state
      return { ...state, staging: { ...state.staging, durationMinutes: next } }
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
      // prior status, flags and timezone always carry forward untouched.
      const committed = commitSchedule(candidate, {
        id: prior?.id,
        flags: prior?.flags ?? [],
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

    case 'toggleFlag': {
      const marker = flagMarkerAt(state.activities, state.selectedSlot)
      if (marker) {
        const flags = marker.flags.includes(action.flag)
          ? marker.flags.filter((f) => f !== action.flag)
          : [...marker.flags, action.flag]
        if (flags.length === 0) {
          return { ...state, activities: state.activities.filter((a) => a.id !== marker.id) }
        }
        return {
          ...state,
          activities: state.activities.map((a) => (a.id === marker.id ? { ...a, flags } : a)),
        }
      }
      const { start } = slotMinuteRange(state.selectedSlot)
      const newMarker: ScheduledActivity = {
        id: generateId(),
        name: null,
        path: [],
        startMinutes: start,
        durationMinutes: 0,
        flags: [action.flag],
        status: 'planned',
        timezone:
          typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
      }
      return { ...state, activities: [...state.activities, newMarker] }
    }

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

    default:
      return state
  }
}
