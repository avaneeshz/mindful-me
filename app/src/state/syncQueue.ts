import type { SyncIntent } from './sync'

/**
 * Bug C (write-failure-visibility incident) — a durable retry queue.
 *
 * Previously `runSyncIntents` fired each intent once, fire-and-forget: a
 * failure was `console.warn`'d and then forgotten, and a reload discarded it
 * entirely (nothing durable ever recorded that the write hadn't landed). This
 * module is the PURE data structure the queue is built from — no timers, no
 * network, no localStorage — so every ordering/backoff/merge rule is testable
 * the same way `boardReducer.ts`/`domain/slots.ts` already are. See
 * `syncQueueStorage.ts` for the (thin, fail-closed) persistence and
 * `BoardContext.tsx` for the effect that actually drains it.
 *
 * Deliberately NOT doing: coalescing repeated edits to one activity into a
 * single queued write. Each `enqueueIntents` call appends new entries as-is;
 * `nextItemToAttempt`'s per-activity FIFO guarantees they are sent to the
 * server in the same order they were made, so the final server state always
 * converges on the latest local edit — just via one network call per edit
 * rather than a collapsed one. That is a real, deliberate simplicity
 * trade-off (more requests than strictly necessary) rather than an oversight;
 * this app's actual write volume is nowhere near the point where that costs
 * anything, and coalescing correctly (a delete cancelling an unsent create;
 * folding N edits into 1) is meaningfully more state to get right for no
 * observable benefit at this scale.
 */

export interface QueuedSyncItem {
  /** Identifies this QUEUE ENTRY — never reused, distinct from `activityId`. */
  id: string
  intent: SyncIntent
  /** The scheduled activity this write is about — see `intentActivityId`. */
  activityId: string
  /**
   * `localDateISO` of the calendar day this intent's `reference` (the day
   * `startMinutes` is anchored to) was computed against — a plain string so
   * it round-trips through JSON/localStorage without reviving into a `Date`.
   * Reconstructed via `dateFromLocalDateISO` at send time.
   */
  referenceDateISO: string
  attempts: number
  status: 'pending' | 'failed'
  /** Human-readable reason for the most recent failure, or `null` before any attempt has failed. */
  lastError: string | null
  /** Epoch ms — this item is not attempted again before this instant (backoff). */
  nextAttemptAt: number
}

export type SyncQueue = QueuedSyncItem[]

/** The activity a given intent is ABOUT — the key both retry-ordering and the UI's per-activity indicator group by. */
export function intentActivityId(intent: SyncIntent): string {
  switch (intent.kind) {
    case 'create':
    case 'reschedule':
    case 'flags':
    case 'status':
      return intent.activity.id
    case 'delete':
    case 'restore':
      return intent.id
    case 'addReflection':
    case 'removeReflection':
      return intent.scheduledActivityId
  }
}

/** Appends one queue entry per intent, each due immediately (`nextAttemptAt: now`) — draining is what applies backoff, not enqueueing. */
export function enqueueIntents(
  queue: SyncQueue,
  intents: readonly SyncIntent[],
  referenceDateISO: string,
  now: number,
  makeId: () => string,
): SyncQueue {
  if (intents.length === 0) return queue
  const additions: QueuedSyncItem[] = intents.map((intent) => ({
    id: makeId(),
    intent,
    activityId: intentActivityId(intent),
    referenceDateISO,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: now,
  }))
  return [...queue, ...additions]
}

export function removeQueueItem(queue: SyncQueue, itemId: string): SyncQueue {
  return queue.filter((item) => item.id !== itemId)
}

/**
 * Exponential backoff, capped at 5 minutes — generous enough not to hammer a
 * genuinely-down server, short enough that a blip recovers quickly. `attempts`
 * is the count AFTER the failure just recorded (so the very first failure —
 * attempts becoming 1 — waits 30s, not 0).
 */
export function backoffMs(attempts: number): number {
  const CAP_MS = 5 * 60_000
  const BASE_MS = 30_000
  return Math.min(BASE_MS * 2 ** (attempts - 1), CAP_MS)
}

/**
 * Records a failed attempt: bumps `attempts`, marks `failed`, schedules the
 * next try via `backoffMs`. Never removes the item and never gives up
 * retrying (rule 6 — a write is never silently dropped for being unlucky
 * about connectivity) — it stays `failed` (and keeps surfacing in the UI,
 * per Bug B) until a later attempt actually succeeds.
 */
export function markQueueItemFailed(queue: SyncQueue, itemId: string, error: string, now: number): SyncQueue {
  return queue.map((item) => {
    if (item.id !== itemId) return item
    const attempts = item.attempts + 1
    return { ...item, attempts, status: 'failed', lastError: error, nextAttemptAt: now + backoffMs(attempts) }
  })
}

/**
 * The single next entry due to be (re)attempted, or `null` if nothing is due
 * right now. Enforces per-activity FIFO — an item is skipped if an EARLIER
 * item for the SAME activity hasn't resolved yet, whether that earlier item
 * is itself due or still backing off — so e.g. a queued `delete` can never
 * race ahead of the `create` it depends on, but unrelated activities' writes
 * never wait behind one activity's backoff. Processing exactly one item at a
 * time (the caller loops, re-deriving this after every settle) keeps this
 * simple rather than needing a batch/parallel scheduler.
 */
export function nextItemToAttempt(queue: SyncQueue, now: number): QueuedSyncItem | null {
  const blockedActivityIds = new Set<string>()
  for (const item of queue) {
    if (blockedActivityIds.has(item.activityId)) continue
    if (item.nextAttemptAt <= now) return item
    blockedActivityIds.add(item.activityId)
  }
  return null
}

/** Activity ids with an outstanding write that is NOT a delete — Bug A's reconciliation must never let the server clobber these. */
export function pendingActivityIds(queue: SyncQueue): Set<string> {
  return new Set(queue.filter((item) => item.intent.kind !== 'delete').map((item) => item.activityId))
}

/** Activity ids with an outstanding, unconfirmed delete — Bug A's reconciliation must not let the server's stale copy resurrect these. */
export function pendingDeleteActivityIds(queue: SyncQueue): Set<string> {
  return new Set(queue.filter((item) => item.intent.kind === 'delete').map((item) => item.activityId))
}

/** This one activity's sync status, for the per-activity indicator (`ActivitySummary`). */
export function activitySyncState(queue: SyncQueue, activityId: string): 'synced' | 'pending' | 'failed' {
  const items = queue.filter((item) => item.activityId === activityId)
  if (items.length === 0) return 'synced'
  return items.some((item) => item.status === 'failed') ? 'failed' : 'pending'
}

/** A short, user-safe message for the queue entry's `lastError` — never leaks a raw error object into the UI. */
export function describeSyncError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

/**
 * Bug B — the header's persistent sync indicator (`SyncStatusPill`), reduced
 * to a pure value so every state is asserted without rendering anything (same
 * reasoning `isStagingComplete`/`stagingOptions` in `boardReducer.ts` are kept
 * pure and separate from the components that read them).
 *
 * `hidden` is deliberate, not an oversight: a fully-synced board must render
 * NOTHING here — a permanent "Synced ✓" badge would be exactly the "anxious
 * status widget" this is trying to avoid. The pill earns its place on screen
 * only once there is something true and useful to say, and then it STAYS
 * (never a toast that auto-dismisses) until that stops being true.
 */
export type SyncIndicatorState =
  | { kind: 'hidden' }
  | { kind: 'pending'; count: number }
  | { kind: 'failed'; count: number }

export function describeSyncIndicator(queue: SyncQueue): SyncIndicatorState {
  if (queue.length === 0) return { kind: 'hidden' }
  const failedCount = queue.filter((item) => item.status === 'failed').length
  if (failedCount > 0) return { kind: 'failed', count: failedCount }
  return { kind: 'pending', count: queue.length }
}
