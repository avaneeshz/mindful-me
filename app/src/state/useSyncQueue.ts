import { useEffect, useRef, useState } from 'react'
import { logActivity } from '@/lib/activityLogger'
import { dateFromLocalDateISO } from '@/lib/localTime'
import { runIntent, type SyncIntent } from './sync'
import {
  describeSyncError,
  describeSyncIntent,
  enqueueIntents,
  markQueueItemFailed,
  nextItemToAttempt,
  removeQueueItem,
  type SyncQueue,
} from './syncQueue'
import { loadSyncQueue, saveSyncQueue } from './syncQueueStorage'

/** How often the queue is woken to check for backed-off items becoming due again — see `drainQueue` below. */
const SYNC_RETRY_INTERVAL_MS = 15_000

export interface SyncQueueHandle {
  /** Every write not yet CONFIRMED on the server. Empty means fully synced. Drives the sync indicators. */
  queue: SyncQueue
  /**
   * Always the latest queue, for async callbacks (server reconciliation)
   * that must see writes made since they started — never a stale closure.
   */
  queueRef: { readonly current: SyncQueue }
  /** Durably records intents (persisted before anything else sees them), then kicks a drain so a healthy connection still feels instant. */
  enqueue: (intents: SyncIntent[], referenceDateISO: string) => void
  /** Wakes the queue now instead of waiting for the next backoff/interval tick — the indicator's "Retry now". */
  retryNow: () => void
}

/**
 * The durable background-sync retry queue (Bug B/C — the write-failure-
 * visibility incident), shared by both interfaces: Classic's
 * `BoardProvider` and Lumen's data provider mount this one hook, so the
 * retry, backoff and persistence behaviour cannot drift between them. Only
 * one interface is ever mounted at a time, and the queue itself lives in
 * local storage, so writes made in one interface keep retrying after a
 * switch to the other.
 *
 * `disabled` (tests) keeps everything in memory and never touches the
 * network, the same contract `BoardProvider`'s `now` prop always had.
 */
export function useSyncQueue(disabled: boolean): SyncQueueHandle {
  const [queue, setQueue] = useState<SyncQueue>(() => (disabled ? [] : loadSyncQueue()))
  // `queue` drives the UI; `queueRef` is the single source of truth
  // `drainQueue` reads/mutates synchronously so a tight retry loop never has
  // to wait for a render to see its own previous iteration's result.
  // `updateQueue` is the ONLY thing allowed to write either — every mutation
  // goes through it, so the two never drift and every mutation is persisted
  // (`saveSyncQueue`) before anything else observes it.
  const queueRef = useRef(queue)

  function updateQueue(updater: (current: SyncQueue) => SyncQueue): void {
    setQueue((current) => {
      const next = updater(current)
      queueRef.current = next
      if (!disabled) saveSyncQueue(next)
      return next
    })
  }

  // Drains every currently-DUE item, one at a time (never in parallel — see
  // `nextItemToAttempt`'s own doc comment for why one-at-a-time is enough
  // here), stopping once nothing is left to attempt right now. `processingRef`
  // makes concurrent calls (mount + interval + online event all firing close
  // together, or a retry click while an interval tick is already mid-drain)
  // a no-op rather than double-sending the same write.
  const processingRef = useRef(false)
  async function drainQueue(): Promise<void> {
    if (disabled || processingRef.current) return
    processingRef.current = true
    try {
      for (;;) {
        const item = nextItemToAttempt(queueRef.current, Date.now())
        if (!item) return
        try {
          await runIntent(item.intent, dateFromLocalDateISO(item.referenceDateISO))
          updateQueue((current) => removeQueueItem(current, item.id))
          logActivity({
            kind: 'sync',
            summary: `Synced: ${describeSyncIntent(item.intent)}${item.attempts > 0 ? ` (after ${item.attempts} failed ${item.attempts === 1 ? 'try' : 'tries'})` : ''}`,
            detail: item.intent,
          })
        } catch (error) {
          // Never thrown into the UI (rule 6) — recorded durably instead, so
          // it survives a reload and keeps retrying with backoff until it
          // clears (Bug C), and stays visible until it does (Bug B).
          const reason = describeSyncError(error)
          updateQueue((current) => markQueueItemFailed(current, item.id, reason, Date.now()))
          logActivity({
            kind: 'sync',
            level: 'error',
            summary: `Not synced: ${describeSyncIntent(item.intent)} — ${reason}`,
            detail: { attempt: item.attempts + 1, error: reason, intent: item.intent },
          })
        }
      }
    } finally {
      processingRef.current = false
    }
  }

  // Wakes the queue: once on mount (a reload with pending/failed writes must
  // retry them without waiting for the interval), on an interval (catches
  // items whose backoff has expired with no other trigger), and the instant
  // connectivity returns.
  useEffect(() => {
    if (disabled) return
    const wake = () => void drainQueue()
    wake()
    const interval = window.setInterval(wake, SYNC_RETRY_INTERVAL_MS)
    window.addEventListener('online', wake)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', wake)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])

  function enqueue(intents: SyncIntent[], referenceDateISO: string): void {
    if (disabled || intents.length === 0) return
    for (const intent of intents) {
      logActivity({ kind: 'save', summary: `Saved on device: ${describeSyncIntent(intent)}`, detail: intent })
    }
    updateQueue((current) => enqueueIntents(current, intents, referenceDateISO, Date.now(), () => crypto.randomUUID()))
    void drainQueue()
  }

  return { queue, queueRef, enqueue, retryNow: () => void drainQueue() }
}
