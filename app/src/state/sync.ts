import { flagMarkerAt } from '@/domain/slots'
import type { ScheduledActivity } from '@/domain/types'
import type { BoardAction, BoardState } from './boardReducer'
import {
  apiCreateScheduledActivity,
  apiRecordLocalEditConflict,
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
 * anything. Phase 5 turned the "fire and forget" side of this into a real,
 * persisted outbox: `state/syncQueue.ts` decides WHEN each intent runs (and
 * whether a failure retries or is a genuine conflict), `state/syncEngine.ts`
 * runs it, and `performSyncIntent` below is the one place an intent becomes
 * an actual API call.
 */
export type SyncIntent =
  | { kind: 'create'; activity: ScheduledActivity }
  | { kind: 'reschedule'; activity: ScheduledActivity }
  | { kind: 'flags'; activity: ScheduledActivity }
  | { kind: 'status'; activity: ScheduledActivity }
  | { kind: 'delete'; id: string }
  | { kind: 'restore'; id: string }
  /**
   * Rule 7 — the edit that LOST a last-write-wins resolution, on its way to
   * `activity_events` so it is kept rather than silently discarded. Recorded
   * as an intent (not written straight out) so it inherits the same offline
   * durability as every other write: a loser detected while the network is
   * down still reaches the audit trail once connectivity returns.
   */
  | { kind: 'conflict'; activityId: string | null; record: LosingEditRecord }

export type ConflictReason =
  /** A newer edit from another device was already on the server when we read it. */
  | 'superseded'
  /** The server refused this write outright (its time is taken, or the row is gone). */
  | 'rejected'

/** The losing edit itself, preserved verbatim. */
export interface LosingEditRecord {
  reason: ConflictReason
  /** Which write was lost. */
  intent: Exclude<SyncIntent['kind'], 'conflict'>
  /** The local activity as it stood, when the lost write had a full row. */
  activity: ScheduledActivity | null
  /** Device-clock time of the local edit. */
  editedAt: string
  /** Calendar day (YYYY-MM-DD) the edit's wall-clock minutes were anchored to. */
  dayISO: string
  /** The winning server row's `updated_at`, for a 'superseded' loss. */
  serverUpdatedAt?: string
  /** The server's own refusal message, for a 'rejected' loss. */
  serverError?: string
}

/**
 * Which activity an intent concerns, or `null` when it concerns none (a
 * conflict record is an append-only note, never coalesced with anything).
 * The queue's coalescing rules are all keyed off this.
 */
export function activityIdOf(intent: SyncIntent): string | null {
  switch (intent.kind) {
    case 'create':
    case 'reschedule':
    case 'flags':
    case 'status':
      return intent.activity.id
    case 'delete':
    case 'restore':
      return intent.id
    case 'conflict':
      return null
  }
}

/**
 * Every write lands locally first, instantly (rule 6) — the reducer has
 * already committed to `nextState` by the time this runs, and this only
 * decides what (if anything) the BACKGROUND sync should additionally do.
 * Deliberately narrow: only the action types that ever touch
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
        return activity ? [{ kind: 'reschedule', activity }] : []
      }
      const prevIds = new Set(prevState.activities.map((a) => a.id))
      const created = nextState.activities.find((a) => !prevIds.has(a.id))
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

    case 'toggleFlag': {
      const before = flagMarkerAt(prevState.activities, prevState.selectedSlot)
      const after = flagMarkerAt(nextState.activities, nextState.selectedSlot)
      if (after && !before) return [{ kind: 'create', activity: after }]
      if (after && before && after.id === before.id) return [{ kind: 'flags', activity: after }]
      if (!after && before) return [{ kind: 'delete', id: before.id }]
      return []
    }

    default:
      return []
  }
}

/**
 * Turns one queued intent into its API call and AWAITS it, so the engine can
 * tell success from failure (the pre-Phase-5 version fired and forgot, which
 * is exactly why a write made while offline never came back). Throws on
 * failure — `classifySyncFailure` in `state/syncQueue.ts` decides whether
 * that means "retry later" or "the server has genuinely refused this".
 *
 * `reference` is the calendar day the intent's wall-clock minutes belong to,
 * carried on the queue entry itself rather than read from live state — a
 * queued write must still be anchored to the day it was made on when it
 * finally flushes, possibly days later on a different `viewedDate`.
 */
export async function performSyncIntent(intent: SyncIntent, reference: Date): Promise<void> {
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
    case 'conflict':
      return apiRecordLocalEditConflict(intent.activityId, intent.record)
  }
}
