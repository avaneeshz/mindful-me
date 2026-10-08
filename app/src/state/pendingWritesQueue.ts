import { backoffMs } from './syncQueue'

/**
 * The durable ledger of user changes the server has not confirmed yet, for
 * everything that does NOT go through the scheduled-activity sync queue
 * (notes, header buttons, tiles, activities, supplements, daily values).
 *
 * Pure data structure — no timers, network or storage — so every ordering,
 * backoff and "never lost" rule is testable, like `syncQueue.ts` beside it.
 *
 * Deliberately has NO expiry. An entry leaves the ledger only when the server
 * confirmed it, or when the app itself rolled the change back and told the
 * user. Time alone never removes one. (The 3-day limit applies to the
 * activity LOG, which is a separate store.)
 */
export interface PendingWrite {
  /** Identifies this ledger entry. */
  id: string
  /** Owner — a change is only ever replayed into the account that made it. */
  userId: string
  /** Replay handler name, e.g. `tile.update` (see the registry in `pendingWrites.ts`). */
  action: string
  /** Collection the record belongs to, e.g. `tile` — what reconcile asks about. */
  entity: string
  /** The record this change is about; also the ordering key. */
  recordId: string
  /** Whether a reconcile should protect the local row (`save`) or keep it gone (`delete`). */
  op: 'save' | 'delete'
  /** JSON-serializable arguments the replay handler is called with. */
  args: unknown[]
  /** Plain-words description for the activity log. */
  label: string
  createdAt: number
  attempts: number
  status: 'pending' | 'failed'
  lastError: string | null
  /** The server answered "no" in a way a retry cannot fix — kept, shown, never retried on its own. */
  permanent: boolean
  /** Epoch ms — not attempted again before this. */
  nextAttemptAt: number
}

export type PendingWrites = PendingWrite[]

export function addWrite(queue: PendingWrites, write: PendingWrite): PendingWrites {
  return [...queue, write]
}

export function removeWrite(queue: PendingWrites, id: string): PendingWrites {
  return queue.filter((w) => w.id !== id)
}

export function amendWrite(queue: PendingWrites, id: string, patch: Partial<Pick<PendingWrite, 'args' | 'label'>>): PendingWrites {
  return queue.map((w) => (w.id === id ? { ...w, ...patch } : w))
}

export function markWriteFailed(queue: PendingWrites, id: string, error: string, now: number): PendingWrites {
  return queue.map((w) => {
    if (w.id !== id) return w
    const attempts = w.attempts + 1
    return { ...w, attempts, status: 'failed', lastError: error, nextAttemptAt: now + backoffMs(attempts) }
  })
}

export function markWritePermanent(queue: PendingWrites, id: string, error: string): PendingWrites {
  return queue.map((w) =>
    w.id === id
      ? { ...w, attempts: w.attempts + 1, status: 'failed', lastError: error, permanent: true, nextAttemptAt: Number.MAX_SAFE_INTEGER }
      : w,
  )
}

/** "Retry now": every entry of this user is due immediately, permanent ones included. */
export function makeAllDue(queue: PendingWrites, userId: string, now: number): PendingWrites {
  return queue.map((w) => (w.userId === userId ? { ...w, permanent: false, nextAttemptAt: now } : w))
}

export function writesForUser(queue: PendingWrites, userId: string | null): PendingWrites {
  return userId === null ? [] : queue.filter((w) => w.userId === userId)
}

/**
 * An earlier entry for the same record must land first, so a later edit can never be overwritten by an older
 * replay. A permanently rejected earlier entry no longer blocks: it is dead until the user retries it, and the
 * records behind it must not be stuck forever because of it.
 */
export function isBlocked(queue: PendingWrites, write: PendingWrite): boolean {
  return queue.some(
    (other) => other !== write && other.entity === write.entity && other.recordId === write.recordId && other.createdAt < write.createdAt && !other.permanent,
  )
}

export function findWrite(queue: PendingWrites, userId: string, entity: string, recordId: string, action?: string): PendingWrite | undefined {
  return queue.find(
    (w) => w.userId === userId && w.entity === entity && w.recordId === recordId && (action === undefined || w.action === action),
  )
}

/** The next entry to replay: oldest first, due, not behind an earlier change to the same record, not in flight. */
export function nextDueWrite(queue: PendingWrites, userId: string, now: number, inFlight: ReadonlySet<string>): PendingWrite | null {
  const mine = writesForUser(queue, userId).sort((a, b) => a.createdAt - b.createdAt)
  for (const write of mine) {
    if (inFlight.has(write.id) || write.nextAttemptAt > now || isBlocked(mine, write)) continue
    return write
  }
  return null
}

export function pendingIds(queue: PendingWrites, userId: string | null, entity: string, op: PendingWrite['op']): Set<string> {
  return new Set(writesForUser(queue, userId).filter((w) => w.entity === entity && w.op === op).map((w) => w.recordId))
}

/** Retry just this one entry now (a permanently rejected one included). */
export function makeOneDue(queue: PendingWrites, id: string, now: number): PendingWrites {
  return queue.map((w) => (w.id === id ? { ...w, permanent: false, nextAttemptAt: now } : w))
}
