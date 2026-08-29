import type { ScheduledActivity } from '@/domain/types'
import type { BoardAction, BoardState } from './boardReducer'
import {
  apiCreateScheduledActivity,
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

    default:
      return []
  }
}

/**
 * Fires each intent's matching API call, best-effort. A failure is logged,
 * never thrown into the UI — the local write already happened (rule 6), and
 * full offline-queue retry hardening is Phase 5, deliberately out of scope
 * here. The next successful sync of the SAME activity (any later edit, or a
 * fresh page load's reconciliation) naturally catches it back up.
 */
export function runSyncIntents(intents: SyncIntent[], reference: Date): void {
  for (const intent of intents) {
    const task = (async () => {
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
      }
    })()

    task.catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.warn(`[sync] ${intent.kind} failed — local state is still correct, will retry on next sync`, error)
    })
  }
}
