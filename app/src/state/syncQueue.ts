/**
 * Phase 5 — the offline write queue, as a PURE data structure.
 *
 * Nothing in this module touches the network, storage, timers or React: it is
 * the complete set of decisions the queue has to make (what to keep, what to
 * collapse, what to send next, how long to wait after a failure, and whether a
 * failure is worth retrying at all), expressed as functions over plain values.
 * `state/syncEngine.ts` is the thin impure shell that actually calls them.
 *
 * Rule 6 is the reason it exists: a write lands in `state.activities` and in
 * local storage instantly, and lands HERE at the same moment, so it survives
 * being made with no connectivity, being retried, and the tab being closed and
 * reopened in between.
 *
 * Ordering is strict FIFO and single-file: the queue always sends its head and
 * never skips past a stuck one. That matters because entries interact — a
 * "delete A" enqueued before a "create B" in A's old time range must reach the
 * server in that order or the exclusion constraint (rule 1) rejects B.
 */
import { activityIdOf, type SyncIntent } from './sync'

export type QueueEntryStatus = 'pending' | 'inflight'

export interface QueueEntry {
  /** Identifies the QUEUE ENTRY — never the activity (see `activityIdOf`). */
  entryId: string
  intent: SyncIntent
  /** Calendar day (YYYY-MM-DD) the intent's wall-clock minutes are anchored to. */
  dayISO: string
  /**
   * Device-clock time of the local edit this entry represents. Rule 7's
   * ordering key: this is what a server row's `updated_at` is compared
   * against to decide which of two devices' edits is the newer one.
   */
  editedAt: string
  status: QueueEntryStatus
  /** Consecutive failed sends. Drives the backoff delay only. */
  attempts: number
  /** Epoch ms before which this entry must not be retried. */
  nextAttemptAt: number
  lastError: string | null
}

export interface SyncQueue {
  readonly entries: readonly QueueEntry[]
}

export const EMPTY_QUEUE: SyncQueue = { entries: [] }

export const BASE_BACKOFF_MS = 1_000
/**
 * The ceiling on retry spacing. Long enough that a queue waiting out a
 * multi-hour outage costs a handful of requests per hour rather than
 * hammering the server; short enough that coming back online is noticed
 * quickly on its own even if no `online` event fires (the engine also
 * flushes immediately on that event, so this is the fallback, not the
 * mechanism).
 */
export const MAX_BACKOFF_MS = 5 * 60_000

/** Exponential, deterministic: 1s, 2s, 4s, 8s … capped at MAX_BACKOFF_MS. */
export function backoffDelayMs(attempts: number): number {
  if (attempts <= 0) return 0
  // 2 ** 30 * 1000 already exceeds the cap by orders of magnitude; clamping
  // the exponent keeps the arithmetic finite for an absurd attempt count.
  const exponent = Math.min(attempts - 1, 30)
  return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS)
}

/**
 * SQLSTATEs the server raises when it has genuinely REFUSED a write on its
 * merits — the time is already taken by another device's activity (rule 1's
 * exclusion constraint, or the RPC's own ceiling check), the row no longer
 * exists, or the payload is invalid. Retrying any of these forever would
 * never succeed and would block every later entry behind it, so they resolve
 * the other way: the local edit loses, and is preserved as a conflict record
 * (rule 7) rather than dropped.
 *
 * Everything NOT in this set — a dropped connection, DNS failure, a 5xx, a
 * blocked host, an expired-but-refreshable session — is retryable, and is
 * retried indefinitely with backoff. A queued write is never discarded for
 * being unlucky about connectivity.
 */
const PERMANENT_SQLSTATES = new Set([
  'P0001', // schedule_conflict raised by create_/reschedule_scheduled_activity
  'P0002', // not_found — the row is gone (deleted on another device)
  '23P01', // exclusion_violation — no_overlapping_activities
  '23514', // check_violation
  '22023', // invalid_parameter_value (e.g. invalid_status)
])

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.length > 0 ? code : null
}

export function classifySyncFailure(error: unknown): 'retryable' | 'permanent' {
  const code = errorCode(error)
  return code !== null && PERMANENT_SQLSTATES.has(code) ? 'permanent' : 'retryable'
}

/** A short, human-readable reason, safe to persist and to show in a tooltip. */
export function describeSyncError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  if (typeof error === 'string' && error.length > 0) return error
  return 'Unknown sync error'
}

export interface EnqueueParams {
  entryId: string
  intent: SyncIntent
  dayISO: string
  /** Epoch ms of the local edit. */
  now: number
}

function freshEntry({ entryId, intent, dayISO, now }: EnqueueParams): QueueEntry {
  return {
    entryId,
    intent,
    dayISO,
    editedAt: new Date(now).toISOString(),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  }
}

/**
 * Adds an intent, collapsing it into an existing PENDING entry for the same
 * activity wherever doing so is provably equivalent to sending both.
 *
 * Coalescing only ever touches `pending` entries — an `inflight` one is
 * already on the wire and its outcome still has to be honoured, so a new edit
 * made mid-request always becomes a follow-up entry behind it.
 */
export function enqueue(queue: SyncQueue, params: EnqueueParams): SyncQueue {
  const { intent, dayISO, now } = params
  const fresh = freshEntry(params)
  const activityId = activityIdOf(intent)

  // A conflict record is an append-only note about a specific past edit —
  // never merged with, or superseded by, anything.
  if (activityId === null) return { entries: [...queue.entries, fresh] }

  const mine = (entry: QueueEntry) =>
    entry.status === 'pending' && activityIdOf(entry.intent) === activityId
  const hasPending = (kind: SyncIntent['kind']) =>
    queue.entries.some((entry) => mine(entry) && entry.intent.kind === kind)

  // Created and deleted without ever reaching the server: the server never
  // knew this activity existed, so BOTH halves of the round trip disappear
  // (sending them would create a row only to soft-delete it a moment later).
  if (intent.kind === 'delete' && hasPending('create')) {
    return { entries: queue.entries.filter((entry) => !mine(entry)) }
  }

  // Undo of a delete that hasn't been sent yet: the delete simply never
  // happens, and there is nothing to restore server-side.
  if (intent.kind === 'restore' && hasPending('delete')) {
    return {
      entries: queue.entries.filter((entry) => !(mine(entry) && entry.intent.kind === 'delete')),
    }
  }

  // Deleting a row the server DOES already know about: every queued edit to
  // it is moot, but the delete itself still has to be sent.
  if (intent.kind === 'delete') {
    return { entries: [...queue.entries.filter((entry) => !mine(entry)), fresh] }
  }

  // A queued create carries the whole row (path, start, duration, flags), so
  // a later reschedule or flag change folds straight into it. Status is the
  // one exception and is NOT folded in: `create_scheduled_activity` always
  // inserts 'planned' and has no status parameter, so completing something
  // that has not been created yet must stay a separate follow-up call.
  if ((intent.kind === 'reschedule' || intent.kind === 'flags') && hasPending('create')) {
    return {
      entries: queue.entries.map((entry) =>
        mine(entry) && entry.intent.kind === 'create'
          ? {
              ...entry,
              intent: { kind: 'create', activity: intent.activity },
              dayISO,
              editedAt: fresh.editedAt,
              attempts: 0,
              nextAttemptAt: now,
              lastError: null,
            }
          : entry,
      ),
    }
  }

  // Successive edits of the same facet: only the latest one matters. A fresh
  // user edit also clears any backoff — the user just acted, so try now.
  if (
    (intent.kind === 'reschedule' || intent.kind === 'flags' || intent.kind === 'status') &&
    hasPending(intent.kind)
  ) {
    return {
      entries: queue.entries.map((entry) =>
        mine(entry) && entry.intent.kind === intent.kind
          ? {
              ...entry,
              intent,
              dayISO,
              editedAt: fresh.editedAt,
              attempts: 0,
              nextAttemptAt: now,
              lastError: null,
            }
          : entry,
      ),
    }
  }

  return { entries: [...queue.entries, fresh] }
}

/**
 * The one entry eligible to send right now, or null. Strict FIFO: if the head
 * is still serving its backoff, nothing behind it goes early — see the
 * ordering note at the top of this file.
 */
export function takeNext(queue: SyncQueue, now: number): QueueEntry | null {
  const head = queue.entries[0]
  if (!head) return null
  if (head.status === 'inflight') return null
  if (head.nextAttemptAt > now) return null
  return head
}

export function markInFlight(queue: SyncQueue, entryId: string): SyncQueue {
  return {
    entries: queue.entries.map((entry) =>
      entry.entryId === entryId ? { ...entry, status: 'inflight' as const } : entry,
    ),
  }
}

export function markSucceeded(queue: SyncQueue, entryId: string): SyncQueue {
  return { entries: queue.entries.filter((entry) => entry.entryId !== entryId) }
}

export interface FailureOutcome {
  queue: SyncQueue
  /** Set only when the server REFUSED the write and the entry was dropped. */
  refused: QueueEntry | null
}

export function markFailed(
  queue: SyncQueue,
  entryId: string,
  { now, error }: { now: number; error: unknown },
): FailureOutcome {
  const entry = queue.entries.find((candidate) => candidate.entryId === entryId)
  if (!entry) return { queue, refused: null }

  const lastError = describeSyncError(error)

  if (classifySyncFailure(error) === 'permanent') {
    return {
      queue: { entries: queue.entries.filter((candidate) => candidate.entryId !== entryId) },
      refused: { ...entry, status: 'pending', lastError },
    }
  }

  const attempts = entry.attempts + 1
  return {
    queue: {
      entries: queue.entries.map((candidate) =>
        candidate.entryId === entryId
          ? {
              ...candidate,
              status: 'pending' as const,
              attempts,
              nextAttemptAt: now + backoffDelayMs(attempts),
              lastError,
            }
          : candidate,
      ),
    },
    refused: null,
  }
}

/**
 * Re-arms a queue restored from storage. Anything persisted as `inflight` was
 * on the wire when the tab closed and has an unknown outcome, so it goes back
 * to `pending` to be sent again — safe because every write path is
 * idempotent: `create_scheduled_activity` upserts on the client-minted id,
 * reschedule/flags/status are absolute (not deltas), and delete/restore are
 * setting a column to a fixed value. Backoff is also cleared: a reload is a
 * deliberate fresh start, not a continuation of the old wait.
 */
export function rearm(queue: SyncQueue, now: number): SyncQueue {
  return {
    entries: queue.entries.map((entry) => ({
      ...entry,
      status: 'pending' as const,
      attempts: 0,
      nextAttemptAt: now,
    })),
  }
}

/** The local edit still waiting to be sent for each activity, newest first. */
export interface PendingEdit {
  /** Device-clock ISO time of the newest queued edit to this activity. */
  editedAt: string
  /** True when the queued write would remove the activity server-side. */
  removes: boolean
  /** True when the activity does not exist server-side yet. */
  creates: boolean
}

export function pendingEditsById(queue: SyncQueue): Map<string, PendingEdit> {
  const byId = new Map<string, PendingEdit>()
  for (const entry of queue.entries) {
    const activityId = activityIdOf(entry.intent)
    if (activityId === null) continue
    const existing = byId.get(activityId)
    byId.set(activityId, {
      editedAt:
        existing && existing.editedAt > entry.editedAt ? existing.editedAt : entry.editedAt,
      removes: entry.intent.kind === 'delete',
      creates: (existing?.creates ?? false) || entry.intent.kind === 'create',
    })
  }
  return byId
}

/**
 * Drops every queued write for one activity and hands them back — what
 * happens when the SERVER's version of that activity wins a last-write-wins
 * resolution (rule 7). Pushing the loser afterwards would undo the winner, so
 * the entries have to go; returning them is what lets the caller preserve
 * them as conflict records instead of silently discarding them.
 *
 * An `inflight` entry is deliberately left alone: it is already on the wire
 * and its outcome (success, retry, or refusal) is handled where it lands.
 */
export function cancelPendingFor(
  queue: SyncQueue,
  activityId: string,
): { queue: SyncQueue; cancelled: QueueEntry[] } {
  const cancelled = queue.entries.filter(
    (entry) => entry.status === 'pending' && activityIdOf(entry.intent) === activityId,
  )
  if (cancelled.length === 0) return { queue, cancelled: [] }
  const cancelledIds = new Set(cancelled.map((entry) => entry.entryId))
  return {
    queue: { entries: queue.entries.filter((entry) => !cancelledIds.has(entry.entryId)) },
    cancelled,
  }
}

export interface QueueSummary {
  /** Entries still to be sent, including one currently on the wire. */
  total: number
  /** True while an entry is actually on the wire. */
  sending: boolean
  /**
   * True when the head has failed at least once and is waiting out a backoff
   * — the difference between "syncing" and "not getting through".
   */
  retrying: boolean
  /** The head's most recent failure message, if it has one. */
  lastError: string | null
  /** Epoch ms of the next scheduled attempt, or null if one can run now. */
  nextAttemptAt: number | null
}

export function summarize(queue: SyncQueue, now: number): QueueSummary {
  const head = queue.entries[0] ?? null
  const sending = head?.status === 'inflight'
  return {
    total: queue.entries.length,
    sending,
    retrying: !sending && head !== null && head.attempts > 0,
    lastError: head?.lastError ?? null,
    nextAttemptAt: head && head.nextAttemptAt > now ? head.nextAttemptAt : null,
  }
}
