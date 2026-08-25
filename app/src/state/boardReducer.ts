import { findCard } from '@/data/activities'
import {
  MAX_ACTIVITIES_PER_SLOT,
  SLOT_MINUTES,
  clampDuration,
  entryAt,
  maxScheduleDuration,
  normalizeSlot,
  periodOfSlot,
  slotIndexFromDate,
  usedMinutes,
} from '@/domain/slots'
import type { FlagId, Period, PlacedActivity, SlotEntries, SlotEntry } from '@/domain/types'

/**
 * What is currently staged in the right-hand pane but not yet committed.
 * Nothing here has touched `entries` — Add/Save is the only commit point.
 */
export interface StagingState {
  cardName: string | null
  /** Drill-down path so far, e.g. ["Oiling"] then ["Oiling", "Body"]. */
  path: string[]
  duration: number
  /**
   * Index of the activity being edited in place, or null when adding a new one.
   * Saving replaces that entry rather than appending a duplicate.
   */
  editingIndex: number | null
  /**
   * The slot `editingIndex` actually indexes into — i.e. the activity's real
   * anchor. Always set together with `editingIndex` (both null, or both set).
   *
   * This is deliberately NOT always `selectedSlot`: editing a multi-slot
   * activity from a slot it merely spills into (see `SlotActivityList`'s
   * spillover row) edits the one real record at its anchor WITHOUT moving
   * `selectedSlot` away from the slot the user is looking at — otherwise
   * trimming e.g. a 60-minute activity down to 45 from its 7:00 spillover row
   * forced a jump back to its 6:30 anchor to see the result, which read as
   * "I can't edit this slot" even though the edit itself worked.
   */
  editingSlot: number | null
}

/** A just-removed activity, held briefly so it can be undone. */
export interface RemovalRecord {
  id: number
  slot: number
  index: number
  activity: PlacedActivity
}

export interface BoardState {
  entries: SlotEntries
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
  /**
   * Monotonic source of `RemovalRecord.id`. Lives in state so the reducer stays
   * pure — it previously called `Date.now()`, the one impure line in here.
   */
  nextRemovalId: number
}

export const EMPTY_STAGING: StagingState = {
  cardName: null,
  path: [],
  duration: 0,
  editingIndex: null,
  editingSlot: null,
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
  | { type: 'editActivity'; index: number; slot?: number }
  | { type: 'removeActivity'; index: number }
  | { type: 'undoRemoval' }
  | { type: 'dismissRemoval'; id: number }
  | { type: 'toggleFlag'; flag: FlagId }
  | { type: 'dropCard'; cardName: string; slot: number }

/**
 * A working copy of a slot entry. `SlotEntry`'s own arrays are `readonly` (they
 * are shared, and the empty entry is frozen), so mutation happens here and the
 * result is written back through `withEntry`.
 */
interface DraftSlotEntry {
  activities: PlacedActivity[]
  flags: FlagId[]
}

function cloneEntry(entry: SlotEntry | undefined): DraftSlotEntry {
  return {
    activities: entry ? entry.activities.map((a) => ({ ...a, path: [...a.path] })) : [],
    flags: entry ? [...entry.flags] : [],
  }
}

/**
 * Invalidate a pending undo once the slot it belongs to has been written again.
 *
 * Without this, Undo could re-insert an activity into a slot that has since been
 * refilled — remove one of two entries, add a different one into the freed
 * minutes, then Undo — producing 3 activities / 45 minutes in a 30-minute slot.
 * Dropping the stale record makes Undo unavailable rather than corrupting state,
 * which is the honest outcome: the thing it would undo no longer exists.
 */
function removalAfterWrite(
  removal: RemovalRecord | null,
  slot: number,
): RemovalRecord | null {
  return removal && removal.slot === slot ? null : removal
}

/** Drop slots that hold neither activities nor flags, keeping `entries` sparse. */
function withEntry(entries: SlotEntries, slot: number, entry: SlotEntry): SlotEntries {
  const next = { ...entries }
  if (entry.activities.length === 0 && entry.flags.length === 0) {
    delete next[slot]
  } else {
    next[slot] = entry
  }
  return next
}

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

export function createInitialState(entries: SlotEntries, now: Date): BoardState {
  const selectedSlot = slotIndexFromDate(now)
  return {
    entries,
    selectedSlot,
    staging: EMPTY_STAGING,
    removal: null,
    focusedPeriod: periodOfSlot(selectedSlot),
    jump: null,
    nextRemovalId: 1,
  }
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'selectSlot': {
      const slot = normalizeSlot(action.slot)
      // Every 30-minute cell is independently selectable/editable, including
      // one entirely covered by an earlier anchor's longer activity spilling
      // into it — it still has its own capacity meter, its own share of that
      // activity to view, and (via `SlotActivityList`'s spillover row) a way
      // to reach that activity's real Edit/Remove. This USED to redirect
      // selection to the covering activity's anchor slot instead, which made
      // a fully-covered slot un-openable outright.
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
      const max = maxScheduleDuration(state.entries, state.selectedSlot, null)
      if (max <= 0) return state
      return {
        ...state,
        staging: {
          cardName: card.name,
          path: [],
          duration: clampDuration(Math.min(SLOT_MINUTES, max), max),
          editingIndex: null,
          editingSlot: null,
        },
      }
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
      // Clears the not-yet-added pick only. Never touches committed entries.
      return { ...state, staging: EMPTY_STAGING }

    case 'stepDuration': {
      if (!state.staging.cardName) return state
      // The slot the staged edit actually applies to — the activity's real
      // anchor when editing (possibly not `selectedSlot`, see `editingSlot`),
      // otherwise wherever a NEW pick is being added (`selectedSlot` itself).
      const editSlot = state.staging.editingSlot ?? state.selectedSlot
      const max = maxScheduleDuration(state.entries, editSlot, state.staging.editingIndex)
      const next = clampDuration(state.staging.duration + action.delta, max)
      if (next === state.staging.duration) return state
      return { ...state, staging: { ...state.staging, duration: next } }
    }

    case 'commit': {
      const { staging, selectedSlot } = state
      if (!staging.cardName || !isStagingComplete(staging)) return state
      // See `stepDuration` — commits to the real anchor, not necessarily the
      // slot currently on screen.
      const editSlot = staging.editingSlot ?? selectedSlot
      const entry = cloneEntry(state.entries[editSlot])
      const max = maxScheduleDuration(state.entries, editSlot, staging.editingIndex)
      const duration = clampDuration(staging.duration, max)
      if (duration <= 0) return state

      const activity: PlacedActivity = {
        name: staging.cardName,
        path: [...staging.path],
        duration,
      }

      if (staging.editingIndex !== null && entry.activities[staging.editingIndex]) {
        entry.activities[staging.editingIndex] = activity
      } else {
        entry.activities.push(activity)
      }

      return {
        ...state,
        entries: withEntry(state.entries, editSlot, entry),
        staging: EMPTY_STAGING,
        removal: removalAfterWrite(state.removal, editSlot),
      }
    }

    case 'editActivity': {
      // `slot` lets a spillover row (see `SlotActivityList`) load the ONE
      // real activity at its actual anchor for editing — in place, without
      // moving `selectedSlot` there. Omitted, it defaults to `selectedSlot`,
      // exactly the prior behaviour for a slot's own native rows.
      const slot = action.slot !== undefined ? normalizeSlot(action.slot) : state.selectedSlot
      const entry = entryAt(state.entries, slot)
      const activity = entry.activities[action.index]
      if (!activity) return state
      return {
        ...state,
        staging: {
          cardName: activity.name,
          path: [...activity.path],
          duration: activity.duration,
          editingIndex: action.index,
          editingSlot: slot,
        },
      }
    }

    case 'removeActivity': {
      const entry = cloneEntry(state.entries[state.selectedSlot])
      const [activity] = entry.activities.splice(action.index, 1)
      if (!activity) return state
      return {
        ...state,
        entries: withEntry(state.entries, state.selectedSlot, entry),
        // Editing the removed row (or a row whose index just shifted) is no
        // longer meaningful, so drop the staged edit.
        staging:
          state.staging.editingIndex === null ? state.staging : EMPTY_STAGING,
        removal: {
          id: state.nextRemovalId,
          slot: state.selectedSlot,
          index: action.index,
          activity,
        },
        nextRemovalId: state.nextRemovalId + 1,
      }
    }

    case 'undoRemoval': {
      const { removal } = state
      if (!removal) return state
      const entry = cloneEntry(state.entries[removal.slot])

      // Belt and braces alongside `removalAfterWrite`: restoring must never be
      // the one path that can breach the <=2 activities / <=30 minutes rule
      // every other path enforces. A restore that no longer fits is discarded,
      // not applied.
      const exceedsCount = entry.activities.length + 1 > MAX_ACTIVITIES_PER_SLOT
      const exceedsMinutes = usedMinutes(entry) + removal.activity.duration > SLOT_MINUTES
      if (exceedsCount || exceedsMinutes) {
        return { ...state, removal: null }
      }

      const index = Math.min(removal.index, entry.activities.length)
      entry.activities.splice(index, 0, removal.activity)
      return {
        ...state,
        entries: withEntry(state.entries, removal.slot, entry),
        removal: null,
      }
    }

    case 'dismissRemoval':
      if (state.removal?.id !== action.id) return state
      return { ...state, removal: null }

    case 'toggleFlag': {
      const entry = cloneEntry(state.entries[state.selectedSlot])
      const index = entry.flags.indexOf(action.flag)
      if (index > -1) entry.flags.splice(index, 1)
      else entry.flags.push(action.flag)
      return { ...state, entries: withEntry(state.entries, state.selectedSlot, entry) }
    }

    /**
     * A DROP NEVER COMMITS.
     *
     * Dropping a card used to place a flat card straight into the slot at an
     * assumed 30 minutes, so the duration stepper, the capacity ceiling message
     * and the explicit "Add to slot" confirmation were all bypassed on the drag
     * path only — two different ways to place an activity, with two different
     * sets of rules.
     *
     * It is now defined as exactly what the manual flow does: select the
     * dropped slot, then pick that card. Not "the same behaviour" — literally
     * the same two reducer cases, so the drop inherits slot resolution, the
     * default duration, the 2-activity / 30-minute capacity rules and the
     * conflict handling verbatim, and can never drift from them.
     *
     * Consequences that fall out of the delegation, all intended:
     *  - dropping onto a slot already covered by a longer activity selects
     *    that literal slot (not the covering activity's anchor — every cell
     *    is independently selectable, see `selectSlot`), same as clicking it;
     *  - dropping onto a full slot (whether full on its own activities, or
     *    entirely covered by an earlier anchor's spillover) selects it and
     *    stages nothing, so the editor's at-capacity banner explains why
     *    (`pickCard` no-ops at max 0);
     *  - a card with sub-options opens its sub-picker; a flat card is staged
     *    complete and needs only the confirm. Neither is written to `entries`
     *    until the user presses Add to slot.
     */
    case 'dropCard': {
      const selected = boardReducer(state, { type: 'selectSlot', slot: action.slot })
      return boardReducer(selected, { type: 'pickCard', cardName: action.cardName })
    }

    default:
      return state
  }
}
