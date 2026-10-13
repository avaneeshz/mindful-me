import type { SyncIntent } from './sync'
import { formatActivityRange } from '@/domain/slots'
import { formatDatedRange, shortDateLabel } from '@/domain/windowAxis'

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
 * Deliberately NOT doing (with two narrow exceptions below): coalescing
 * repeated edits to one activity into a single queued write. Each `enqueueIntents` call appends new entries as-is;
 * `nextItemToAttempt`'s per-activity FIFO guarantees they are sent to the
 * server in the same order they were made, so the final server state always
 * converges on the latest local edit — just via one network call per edit
 * rather than a collapsed one. That is a real, deliberate simplicity
 * trade-off (more requests than strictly necessary) rather than an oversight;
 * this app's actual write volume is nowhere near the point where that costs
 * anything, and coalescing correctly (a delete cancelling an unsent create;
 * folding N edits into 1) is meaningfully more state to get right for no
 * observable benefit at this scale.
 *
 * The two exceptions both concern a create the server REFUSED for good (a
 * `permanent` item — see `isPermanentSyncError`), which the server provably
 * never stored: editing that activity re-sends the corrected create instead of
 * queuing an edit behind a write that can never succeed, and deleting it just
 * forgets it (there is nothing on the server to delete).
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
  /**
   * The server refused this write in a way no retry can fix (an overlap, an
   * invalid value, a function that does not exist). It is kept — never dropped —
   * but not retried on its own: `nextAttemptAt` is pushed out of reach until the
   * user retries it, edits the activity, or discards it. Absent on entries
   * saved before this existed, which read as `false`.
   */
  permanent?: boolean
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

/** A plain-words label for an intent, for the user's activity log: `Add “Walk”`, `Delete an activity`. */
export function describeSyncIntent(intent: SyncIntent): string {
  switch (intent.kind) {
    case 'create':
      return `Add “${intent.activity.name}”`
    case 'reschedule':
      return `Edit “${intent.activity.name}”`
    case 'flags':
      return `Change flags on “${intent.activity.name}”`
    case 'status':
      return `Change status of “${intent.activity.name}”`
    case 'delete':
      return 'Delete an activity'
    case 'restore':
      return 'Restore an activity'
    case 'addReflection':
      return 'Save a reflection'
    case 'removeReflection':
      return 'Remove a reflection'
  }
}

/** The create the server refused for good for this activity, if any — the one write the server provably never stored. */
function refusedCreateFor(queue: SyncQueue, activityId: string): QueuedSyncItem | undefined {
  return queue.find((item) => item.activityId === activityId && item.permanent === true && item.intent.kind === 'create')
}

/**
 * Appends one queue entry per intent, each due immediately (`nextAttemptAt:
 * now`) — draining is what applies backoff, not enqueueing. The two exceptions
 * to "always append" are described at the top of this file: both only ever
 * apply to an activity whose create the server refused for good.
 */
export function enqueueIntents(
  queue: SyncQueue,
  intents: readonly SyncIntent[],
  referenceDateISO: string,
  now: number,
  makeId: () => string,
): SyncQueue {
  if (intents.length === 0) return queue
  let next = queue
  for (const intent of intents) {
    const activityId = intentActivityId(intent)
    const refused = refusedCreateFor(next, activityId)
    if (refused && intent.kind === 'reschedule') {
      // The edit carries the corrected placement: send THAT as the create.
      next = next.map((item) =>
        item.id === refused.id
          ? {
              ...item,
              intent: { kind: 'create' as const, activity: intent.activity },
              referenceDateISO,
              attempts: 0,
              status: 'pending' as const,
              permanent: false,
              lastError: null,
              nextAttemptAt: now,
            }
          : item,
      )
      continue
    }
    if (refused && intent.kind === 'delete') {
      next = next.filter((item) => item.activityId !== activityId)
      continue
    }
    next = [
      ...next,
      {
        id: makeId(),
        intent,
        activityId,
        referenceDateISO,
        attempts: 0,
        status: 'pending' as const,
        lastError: null,
        nextAttemptAt: now,
      },
    ]
  }
  return next
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

/** The server's answer to a write that a retry can never change: refused outright, not merely unreachable. */
const PERMANENT_ERROR_CODES = new Set([
  'P0001', // a rule the server enforces (e.g. `schedule_conflict`)
  '22P02', // invalid input syntax (e.g. a value that is not a UUID)
  '22023', // invalid parameter value
  '22003', // numeric value out of range
  '22001', // value too long
  '23502', // not-null violation
  '23503', // foreign-key violation
  '23505', // unique violation
  '23514', // check violation
  '23P01', // exclusion violation (an overlap, at the database level)
  '42501', // insufficient privilege
  'PGRST202', // the function does not exist on this server
  'PGRST204', // a column does not exist on this server
])

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

/**
 * True when retrying can never succeed. An unreachable server, a timeout, an
 * expired login — anything transient — is NOT permanent and keeps retrying with
 * backoff. Anything unrecognised is also treated as transient: when in doubt,
 * keep trying rather than give up on someone's data.
 */
export function isPermanentSyncError(error: unknown): boolean {
  const code = errorCodeOf(error)
  return code !== undefined && PERMANENT_ERROR_CODES.has(code)
}

/** Records a refusal: kept, flagged, and parked until the user decides. */
export function markQueueItemPermanent(queue: SyncQueue, itemId: string, error: string): SyncQueue {
  return queue.map((item) =>
    item.id === itemId
      ? {
          ...item,
          attempts: item.attempts + 1,
          status: 'failed' as const,
          permanent: true,
          lastError: error,
          nextAttemptAt: Number.MAX_SAFE_INTEGER,
        }
      : item,
  )
}

/** "Try again": the entry is due immediately and no longer parked. */
export function retryQueueItem(queue: SyncQueue, itemId: string, now: number): SyncQueue {
  return queue.map((item) =>
    item.id === itemId ? { ...item, permanent: false, status: 'pending' as const, nextAttemptAt: now } : item,
  )
}

/** "Retry now" for everything, parked entries included. */
export function retryAllQueueItems(queue: SyncQueue, now: number): SyncQueue {
  return queue.map((item) => ({ ...item, permanent: false, nextAttemptAt: now }))
}

/** Forgets every queued write for one activity — what "discard" means for an entry the server never accepted. */
export function discardActivityItems(queue: SyncQueue, activityId: string): SyncQueue {
  return queue.filter((item) => item.activityId !== activityId)
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
export function activitySyncState(queue: SyncQueue, activityId: string): 'synced' | 'pending' | 'failed' | 'rejected' {
  const items = queue.filter((item) => item.activityId === activityId)
  if (items.length === 0) return 'synced'
  if (items.some((item) => item.permanent)) return 'rejected'
  return items.some((item) => item.status === 'failed') ? 'failed' : 'pending'
}

/** A short, user-safe message for the queue entry's `lastError` — never leaks a raw error object into the UI. */
export function describeSyncError(error: unknown): string {
  if (error instanceof Error) return error.message
  // A Postgrest error is a plain object carrying `message` (and `code`) on some client versions.
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return typeof error === 'string' ? error : 'Unknown error'
}

/**
 * Bug B — the header's persistent sync indicator (`SyncStatusPill`), reduced
 * to a pure value so every state is asserted without rendering anything (same
 * reasoning `isStagingComplete`/`stagingOptions` in `boardReducer.ts` are kept
 * pure and separate from the components that read them).
 *
 * `synced` used to be `hidden` — the original design rendered nothing at all
 * once the queue drained, on the theory that a permanent "Synced ✓" badge
 * would be an anxious status widget nobody needed. The product owner
 * overrode that deliberately: they want to be able to glance at the header
 * and always know sync state, including the calm case, not just when
 * something needs attention. So `synced` is a real, always-rendered state
 * now, not an absence — `SyncStatusPill` never returns `null`. It stays the
 * quiet one of the three (no animation, minimal chrome) so it reads as
 * "nothing to worry about" rather than competing with `pending`/`failed` for
 * attention.
 */
export type SyncIndicatorState =
  | { kind: 'synced' }
  | { kind: 'pending'; count: number }
  | { kind: 'failed'; count: number }

export function describeSyncIndicator(queue: readonly { status: 'pending' | 'failed' }[]): SyncIndicatorState {
  if (queue.length === 0) return { kind: 'synced' }
  const failedCount = queue.filter((item) => item.status === 'failed').length
  if (failedCount > 0) return { kind: 'failed', count: failedCount }
  return { kind: 'pending', count: queue.length }
}


/** How one unconfirmed activity write reads in Settings → "Not synced". Same shape the other ledger's rows use. */
export interface SyncQueueRow {
  id: string
  activityId: string
  state: 'rejected' | 'retrying' | 'sending'
  title: string
  reason: string
  detail: string | undefined
  attempts: number
}

function waitText(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

function whenText(item: QueuedSyncItem): string | undefined {
  if (item.intent.kind !== 'create' && item.intent.kind !== 'reschedule') return undefined
  const { startMinutes, durationMinutes } = item.intent.activity
  return (
    formatDatedRange(item.referenceDateISO, startMinutes, durationMinutes) ??
    `${shortDateLabel(item.referenceDateISO)} ${formatActivityRange(startMinutes, durationMinutes)}`
  )
}

export function describeQueueItem(item: QueuedSyncItem, now: number): SyncQueueRow {
  const state = item.permanent ? 'rejected' : item.attempts > 0 ? 'retrying' : 'sending'
  const overlap = item.permanent === true && /schedule_conflict/.test(item.lastError ?? '')
  const reason =
    state === 'rejected'
      ? overlap
        ? 'This time overlaps something already saved to your account (for example from another device). Change its time to send it again, or discard it.'
        : 'The server refused this change, so it will not be retried on its own. Retry it, or discard it and make the change again.'
      : state === 'retrying'
        ? `The server did not accept it yet (tried ${item.attempts} ${item.attempts === 1 ? 'time' : 'times'}). Trying again in ${waitText(item.nextAttemptAt - now)}.`
        : 'Saved on this device and being sent.'
  const when = whenText(item)
  return {
    id: item.id,
    activityId: item.activityId,
    state,
    title: when ? `${describeSyncIntent(item.intent)} · ${when}` : describeSyncIntent(item.intent),
    reason,
    detail: item.lastError ?? undefined,
    attempts: item.attempts,
  }
}

const ROW_ORDER = { rejected: 0, retrying: 1, sending: 2 } as const

/** Refused entries first (they need a decision), then the rest in queue order. */
export function syncQueueRows(queue: SyncQueue, now: number): SyncQueueRow[] {
  return queue
    .map((item, index) => ({ row: describeQueueItem(item, now), index }))
    .sort((a, b) => ROW_ORDER[a.row.state] - ROW_ORDER[b.row.state] || a.index - b.index)
    .map(({ row }) => row)
}
