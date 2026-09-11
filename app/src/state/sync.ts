import type { ScheduledActivity } from '@/domain/types'
import type { BoardAction, BoardState } from './boardReducer'
import {
  apiAddScheduledActivityReflection,
  apiCreateScheduledActivity,
  apiRemoveScheduledActivityReflection,
  apiRescheduleScheduledActivity,
  apiRestoreScheduledActivity,
  apiSetScheduledActivityFlags,
  apiSetScheduledActivityStatus,
  apiSoftDeleteScheduledActivity,
} from '@/api/scheduledActivities'

/**
 * What a dispatched action implies should happen on the server, derived
 * PURELY from the action and the reducer's before/after state — no network
 * call happens in here, which is what keeps this testable without mocking
 * anything. `BoardContext` is the one caller that turns an intent into an
 * actual (best-effort, non-blocking) API call — see `runSyncIntents` below.
 */
export type SyncIntent =
  | { kind: 'create'; activity: ScheduledActivity }
  | { kind: 'reschedule'; activity: ScheduledActivity }
  | { kind: 'flags'; activity: ScheduledActivity }
  | { kind: 'status'; activity: ScheduledActivity }
  | { kind: 'delete'; id: string }
  | { kind: 'restore'; id: string }
  /** `mapReflectionCard` — an upsert of one card's mapping, never a bulk replace. */
  | { kind: 'addReflection'; scheduledActivityId: string; card: number; note: string }
  /** `unmapReflectionCard` — drops one card's mapping only. */
  | { kind: 'removeReflection'; scheduledActivityId: string; card: number }

/**
 * Every write lands locally first, instantly (rule 6) — the reducer has
 * already committed to `nextState` by the time this runs, and this only
 * decides what (if anything) the BACKGROUND sync should additionally do.
 * Deliberately narrow: only the four action types that ever touch
 * `state.activities` produce an intent; everything else (selection,
 * staging, navigation) is presentation-only and never reaches the network.
 */
export function deriveSyncIntents(
  action: BoardAction,
  prevState: BoardState,
  nextState: BoardState,
): SyncIntent[] {
  // The reducer returns the SAME object reference when an action is a no-op
  // (a rejected commit, a pick against a full slot, ...) — nothing to sync.
  if (nextState === prevState) return []

  switch (action.type) {
    case 'commit': {
      const editingId = prevState.staging.editingId
      if (editingId) {
        const activity = nextState.activities.find((a) => a.id === editingId)
        if (!activity) return []
        // Quality rides along inside `reschedule` (see the migration/API
        // comments) — flags deliberately don't, so an edit that changed
        // flags needs its OWN intent alongside the reschedule. Comparing
        // against the PRE-edit activity (not just "does it have a flag")
        // means an edit that leaves flags untouched never fires a redundant
        // extra call.
        const prior = prevState.activities.find((a) => a.id === editingId)
        const flagsChanged = (prior?.flags[0] ?? null) !== (activity.flags[0] ?? null)
        return flagsChanged
          ? [{ kind: 'reschedule', activity }, { kind: 'flags', activity }]
          : [{ kind: 'reschedule', activity }]
      }
      const prevIds = new Set(prevState.activities.map((a) => a.id))
      const created = nextState.activities.find((a) => !prevIds.has(a.id))
      // A brand-new activity's flags AND quality are both already bundled
      // into `create_scheduled_activity` (`apiCreateScheduledActivity` sends
      // both), so one intent covers it — no separate 'flags' intent needed.
      return created ? [{ kind: 'create', activity: created }] : []
    }

    case 'removeActivity':
      return [{ kind: 'delete', id: action.id }]

    case 'undoRemoval': {
      const id = prevState.removal?.activity.id
      return id ? [{ kind: 'restore', id }] : []
    }

    case 'toggleComplete': {
      const activity = nextState.activities.find((a) => a.id === action.id)
      return activity ? [{ kind: 'status', activity }] : []
    }

    // A quick-log entry (Sun/Moon exposure, Vipassana) always appends a
    // brand-new activity — same "diff the id sets" derivation `commit`'s own
    // create branch uses, since a quick log never carries an id of its own
    // until the reducer mints one.
    case 'quickLogActivity': {
      const prevIds = new Set(prevState.activities.map((a) => a.id))
      const created = nextState.activities.find((a) => !prevIds.has(a.id))
      return created ? [{ kind: 'create', activity: created }] : []
    }

    // Reflection mapping — a separate, later action from logging/editing an
    // activity (see `boardReducer.ts`'s own doc comment). The reducer
    // already guarded existence (a no-op returns the SAME state, caught by
    // the `nextState === prevState` check above), so reaching here means it
    // genuinely applied.
    case 'mapReflectionCard':
      return [{ kind: 'addReflection', scheduledActivityId: action.scheduledActivityId, card: action.card, note: action.note }]

    case 'unmapReflectionCard':
      return [{ kind: 'removeReflection', scheduledActivityId: action.scheduledActivityId, card: action.card }]

    default:
      return []
  }
}

/**
 * Fires ONE intent's matching API call. Local state has already committed
 * (rule 6) by the time this ever runs — this only decides whether the
 * background sync succeeded. Throws on failure rather than swallowing it:
 * `BoardContext`'s durable queue (`state/syncQueue.ts`) is what durably
 * records a failure and retries it later (Bug C) and surfaces it in the UI
 * until it clears (Bug B) — this function stays a thin, throwing wrapper so
 * that logic lives in exactly one place.
 */
export function runIntent(intent: SyncIntent, reference: Date): Promise<void> {
  switch (intent.kind) {
    case 'create':
      return apiCreateScheduledActivity(intent.activity, reference)
    case 'reschedule':
      return apiRescheduleScheduledActivity(intent.activity, reference)
    case 'flags':
      return apiSetScheduledActivityFlags(intent.activity.id, intent.activity.flags)
    case 'status':
      return apiSetScheduledActivityStatus(intent.activity.id, intent.activity.status)
    case 'delete':
      return apiSoftDeleteScheduledActivity(intent.id)
    case 'restore':
      return apiRestoreScheduledActivity(intent.id)
    case 'addReflection':
      return apiAddScheduledActivityReflection(intent.scheduledActivityId, intent.card, intent.note)
    case 'removeReflection':
      return apiRemoveScheduledActivityReflection(intent.scheduledActivityId, intent.card)
  }
}
