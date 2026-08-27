/**
 * Durability for the offline write queue. The queue is the only thing
 * standing between "I logged this on the train" and "it reached the server an
 * hour later", so it has to survive the tab being closed — an in-memory queue
 * would quietly lose every unsent write on reload, which is precisely the gap
 * Phase 5 exists to close.
 *
 * Namespaced BY USER: two accounts on one device must never inherit each
 * other's unsent writes (every RPC runs as `auth.uid()`, so flushing user A's
 * queue under user B's session would write A's day into B's account).
 * Local-only mode (no backend, no user) gets its own namespace and simply
 * accumulates nothing worth sending.
 *
 * Both directions fail closed, exactly like `localPersistence.ts`: private
 * browsing, a full quota, or storage blocked by policy degrades to "this
 * session's queue only" rather than crashing the app.
 */
import type { QueueEntry, SyncQueue } from './syncQueue'
import { EMPTY_QUEUE } from './syncQueue'

const STORAGE_PREFIX = 'mindful-me:sync-queue:'

/**
 * Bumped whenever `QueueEntry`'s persisted shape changes incompatibly. A
 * mismatch discards the stored queue rather than feeding a half-understood
 * entry to the engine — losing an unsent write is bad, but replaying a
 * misread one against the live database is worse.
 */
const STORAGE_VERSION = 1

interface StoredQueue {
  version: number
  entries: QueueEntry[]
}

export function queueStorageKey(userId: string | null): string {
  return `${STORAGE_PREFIX}${userId ?? 'local'}`
}

function isEntry(value: unknown): value is QueueEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<QueueEntry>
  return (
    typeof entry.entryId === 'string' &&
    typeof entry.dayISO === 'string' &&
    typeof entry.editedAt === 'string' &&
    typeof entry.attempts === 'number' &&
    typeof entry.nextAttemptAt === 'number' &&
    (entry.status === 'pending' || entry.status === 'inflight') &&
    typeof entry.intent === 'object' &&
    entry.intent !== null &&
    typeof (entry.intent as { kind?: unknown }).kind === 'string'
  )
}

export function loadSyncQueue(userId: string | null): SyncQueue {
  try {
    const raw = window.localStorage.getItem(queueStorageKey(userId))
    if (!raw) return EMPTY_QUEUE
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_QUEUE
    const stored = parsed as Partial<StoredQueue>
    if (stored.version !== STORAGE_VERSION || !Array.isArray(stored.entries)) return EMPTY_QUEUE
    return { entries: stored.entries.filter(isEntry) }
  } catch {
    return EMPTY_QUEUE
  }
}

export function saveSyncQueue(userId: string | null, queue: SyncQueue): void {
  try {
    const key = queueStorageKey(userId)
    if (queue.entries.length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    const stored: StoredQueue = { version: STORAGE_VERSION, entries: [...queue.entries] }
    window.localStorage.setItem(key, JSON.stringify(stored))
  } catch {
    // The in-memory queue is still correct and will still flush in this
    // session; only cross-reload durability is lost for this write.
  }
}
