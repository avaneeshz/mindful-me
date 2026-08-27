/**
 * Phase 5 — the impure shell around the pure queue.
 *
 * Everything that requires a decision lives in `state/syncQueue.ts` (what to
 * coalesce, what to send next, how long to back off, whether a failure is a
 * conflict or bad luck) and `state/reconcile.ts` (which of two devices' edits
 * wins). This module only does the things that cannot be pure: hold the
 * current queue, persist it, run one request at a time, watch connectivity,
 * and tell subscribers what is going on.
 *
 * Every capability it needs is INJECTED, so the whole engine — retry timing,
 * offline behaviour, drain ordering, conflict recording — is testable in the
 * suite's plain Node environment with no DOM, no network and no fake timers
 * beyond a controllable clock.
 *
 * Rule 6 is upheld structurally: `enqueue` only ever appends to a queue and
 * writes it to storage (both synchronous), and returns. Nothing in the UI
 * awaits anything here.
 */
import { activityIdOf, type LosingEditRecord, type SyncIntent } from './sync'
import type { ResolvedConflict } from './reconcile'
import {
  EMPTY_QUEUE,
  cancelPendingFor,
  enqueue as enqueueIntent,
  markFailed,
  markInFlight,
  markSucceeded,
  pendingEditsById,
  rearm,
  summarize,
  takeNext,
  type PendingEdit,
  type QueueEntry,
  type SyncQueue,
} from './syncQueue'

export interface SyncStatus {
  /** False in local-only mode (no backend configured, or nobody signed in). */
  enabled: boolean
  online: boolean
  /** Writes still waiting to reach the server. */
  pending: number
  /** True while a request is actually on the wire. */
  sending: boolean
  /** True when the head has failed and is waiting out a backoff. */
  retrying: boolean
  lastError: string | null
  /** Epoch ms of the last successful send, or null if none this session. */
  lastSyncedAt: number | null
  /** Epoch ms of the last rule-7 resolution (an edit from another device won). */
  lastConflictAt: number | null
}

export interface SyncEngineDeps {
  /** False disables sending entirely — see `SyncStatus.enabled`. */
  enabled: boolean
  perform(entry: QueueEntry): Promise<void>
  load(): SyncQueue
  save(queue: SyncQueue): void
  now(): number
  isOnline(): boolean
  setTimer(fn: () => void, ms: number): number
  clearTimer(handle: number): void
  newId(): string
  /**
   * Called when the board should re-read the server for the window it is
   * showing: the queue just drained, a write was refused, or connectivity
   * came back. Always a request to RE-READ — never a state change itself.
   */
  onReconcileNeeded?(): void
}

export interface SyncEngine {
  getStatus(): SyncStatus
  getQueue(): SyncQueue
  /** Queued-but-unsent edits by activity id — the input `reconcile` needs. */
  pendingEdits(): Map<string, PendingEdit>
  subscribe(listener: (status: SyncStatus) => void): () => void
  /** Rule 6: synchronous, never awaited by the UI. */
  enqueue(intent: SyncIntent, dayISO: string): void
  /** Try to send now (the retry button, an `online` event, a fresh mount). */
  flush(): void
  setOnline(online: boolean): void
  /**
   * Rule 7: the server's version won for these activities. Drops this
   * device's competing queued writes (pushing them would undo the winner) and
   * preserves each of them as a conflict record on its way to
   * `activity_events`.
   */
  recordSupersededEdits(conflicts: readonly ResolvedConflict[]): void
  dispose(): void
}

/** How long a resolved conflict stays worth mentioning in the UI. */
export const CONFLICT_NOTICE_MS = 10_000

function losingRecordFrom(
  entry: QueueEntry,
  extra: { reason: LosingEditRecord['reason']; serverUpdatedAt?: string; serverError?: string },
): LosingEditRecord | null {
  // A conflict record about a conflict record is meaningless — and a failed
  // one is simply retried like any other write.
  if (entry.intent.kind === 'conflict') return null
  const activity =
    entry.intent.kind === 'delete' || entry.intent.kind === 'restore' ? null : entry.intent.activity
  return {
    reason: extra.reason,
    intent: entry.intent.kind,
    activity,
    editedAt: entry.editedAt,
    dayISO: entry.dayISO,
    ...(extra.serverUpdatedAt ? { serverUpdatedAt: extra.serverUpdatedAt } : {}),
    ...(extra.serverError ? { serverError: extra.serverError } : {}),
  }
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  let queue: SyncQueue = deps.enabled ? rearm(deps.load(), deps.now()) : EMPTY_QUEUE
  let online = deps.isOnline()
  let lastSyncedAt: number | null = null
  let lastConflictAt: number | null = null
  let timer: number | null = null
  let disposed = false
  const listeners = new Set<(status: SyncStatus) => void>()

  function status(): SyncStatus {
    const summary = summarize(queue, deps.now())
    return {
      enabled: deps.enabled,
      online,
      pending: summary.total,
      sending: summary.sending,
      retrying: summary.retrying,
      lastError: summary.lastError,
      lastSyncedAt,
      lastConflictAt,
    }
  }

  function notify(): void {
    const snapshot = status()
    for (const listener of listeners) listener(snapshot)
  }

  function persist(): void {
    deps.save(queue)
  }

  function clearTimer(): void {
    if (timer !== null) {
      deps.clearTimer(timer)
      timer = null
    }
  }

  /**
   * Wakes the loop again when the head's backoff expires. Without this, a
   * queue that failed while the tab sat idle would only retry on the next
   * user edit or `online` event.
   */
  function scheduleWake(): void {
    clearTimer()
    if (disposed || !deps.enabled || !online) return
    const nextAttemptAt = summarize(queue, deps.now()).nextAttemptAt
    if (nextAttemptAt === null) return
    timer = deps.setTimer(() => {
      timer = null
      pump()
    }, Math.max(0, nextAttemptAt - deps.now()))
  }

  function appendConflictRecord(activityId: string | null, record: LosingEditRecord): void {
    queue = enqueueIntent(queue, {
      entryId: deps.newId(),
      intent: { kind: 'conflict', activityId, record },
      dayISO: record.dayISO,
      now: deps.now(),
    })
    lastConflictAt = deps.now()
  }

  function onSucceeded(entry: QueueEntry): void {
    if (disposed) return
    const drained = queue.entries.length === 1
    queue = markSucceeded(queue, entry.entryId)
    lastSyncedAt = deps.now()
    persist()
    notify()
    if (drained) deps.onReconcileNeeded?.()
    // Keep draining, but never recursively: one turn of the event loop per
    // entry keeps a long queue from blowing the stack and leaves room for the
    // UI between requests.
    timer = deps.setTimer(() => {
      timer = null
      pump()
    }, 0)
  }

  function onFailed(entry: QueueEntry, error: unknown): void {
    if (disposed) return
    const outcome = markFailed(queue, entry.entryId, { now: deps.now(), error })
    queue = outcome.queue

    if (outcome.refused) {
      // The server refused this write on its merits — its time is taken by
      // another device's activity, or the row is gone. Rule 7: it loses, but
      // it is kept.
      const record = losingRecordFrom(outcome.refused, {
        reason: 'rejected',
        serverError: outcome.refused.lastError ?? undefined,
      })
      if (record) appendConflictRecord(activityIdOf(outcome.refused.intent), record)
      persist()
      notify()
      // The board is now showing an edit the server rejected — re-read so it
      // falls back to the truth instead of displaying a write that never took.
      deps.onReconcileNeeded?.()
      timer = deps.setTimer(() => {
        timer = null
        pump()
      }, 0)
      return
    }

    persist()
    notify()
    scheduleWake()
  }

  function pump(): void {
    if (disposed || !deps.enabled) return
    clearTimer()
    // Offline is not a failure: no attempt is made, so no backoff is burned
    // and the queue simply waits. `setOnline(true)` restarts it immediately.
    if (!online) return

    const entry = takeNext(queue, deps.now())
    if (!entry) {
      scheduleWake()
      return
    }

    queue = markInFlight(queue, entry.entryId)
    persist()
    notify()

    deps.perform(entry).then(
      () => onSucceeded(entry),
      (error: unknown) => onFailed(entry, error),
    )
  }

  return {
    getStatus: status,
    getQueue: () => queue,
    pendingEdits: () => pendingEditsById(queue),

    subscribe(listener) {
      listeners.add(listener)
      listener(status())
      return () => {
        listeners.delete(listener)
      }
    },

    enqueue(intent, dayISO) {
      if (!deps.enabled || disposed) return
      queue = enqueueIntent(queue, { entryId: deps.newId(), intent, dayISO, now: deps.now() })
      persist()
      notify()
      pump()
    },

    flush() {
      pump()
    },

    setOnline(next) {
      if (next === online) return
      online = next
      notify()
      if (next) {
        // Back online — every entry gets an immediate fresh attempt rather
        // than serving out a backoff that was really just "no network".
        queue = rearm(queue, deps.now())
        persist()
        pump()
        deps.onReconcileNeeded?.()
      } else {
        clearTimer()
      }
    },

    recordSupersededEdits(conflicts) {
      if (!deps.enabled || conflicts.length === 0) return
      let changed = false
      for (const conflict of conflicts) {
        const outcome = cancelPendingFor(queue, conflict.activityId)
        queue = outcome.queue
        for (const cancelled of outcome.cancelled) {
          const record = losingRecordFrom(cancelled, {
            reason: 'superseded',
            serverUpdatedAt: conflict.serverUpdatedAt,
          })
          if (record) appendConflictRecord(conflict.activityId, record)
          changed = true
        }
        // A conflict with nothing left to cancel (the entry was already on
        // the wire) still counts as one the user should see acknowledged.
        if (outcome.cancelled.length === 0) {
          lastConflictAt = deps.now()
          changed = true
        }
      }
      if (!changed) return
      persist()
      notify()
      pump()
    },

    dispose() {
      disposed = true
      clearTimer()
      listeners.clear()
    },
  }
}
