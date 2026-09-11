import type { SyncQueue } from './syncQueue'

/**
 * Durable persistence for the retry queue (Bug C) — same fail-closed contract
 * as `localPersistence.ts`/`dismissedActivities.ts`: a private-browsing tab,
 * a full quota, or storage blocked by policy degrades to "nothing queued yet"
 * rather than crashing the app.
 *
 * Deliberately GLOBAL, not namespaced per calendar day like the board cache —
 * a queued write must survive both a reload AND navigating away from the day
 * it was made on (rule 12 lets a past day be edited any time, and the write
 * still needs to reach the server regardless of which day is on screen when
 * it finally does).
 */
const STORAGE_KEY = 'mindful-me:syncQueue:v1'

export function loadSyncQueue(): SyncQueue {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SyncQueue) : []
  } catch {
    return []
  }
}

export function saveSyncQueue(queue: SyncQueue): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // In-memory queue state is still correct; only cross-reload durability is
    // lost for this write — same tradeoff `saveLocalActivities` accepts.
  }
}
