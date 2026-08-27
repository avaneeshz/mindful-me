/**
 * The one place the pure sync engine is bound to real browser capabilities —
 * `localStorage`, `setTimeout`, `navigator.onLine`, and the actual API calls.
 * Kept separate from `syncEngine.ts` so that module (and everything it
 * decides) stays testable with nothing mocked.
 */
import { generateId } from '@/domain/scheduling'
import { localDateFromISO } from '@/lib/localTime'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { performSyncIntent } from './sync'
import { createSyncEngine, type SyncEngine } from './syncEngine'
import { loadSyncQueue, saveSyncQueue } from './syncQueueStorage'

export interface BrowserSyncEngineOptions {
  /** The signed-in user, or null in local-only mode. Namespaces the queue. */
  userId: string | null
  onReconcileNeeded(): void
}

/**
 * `navigator.onLine` is a hint, not a guarantee — it reports "connected to a
 * network", not "can reach the server". A machine on captive-portal Wi-Fi
 * reports online and every request still fails; that case is covered by the
 * retry path, not by this. It is only used to avoid burning attempts (and
 * backoff) when the device already knows there is no network at all.
 */
function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function createBrowserSyncEngine({
  userId,
  onReconcileNeeded,
}: BrowserSyncEngineOptions): SyncEngine {
  return createSyncEngine({
    // Local-only mode has nowhere to send anything, so nothing is queued at
    // all — an inert engine rather than a queue that grows forever.
    enabled: supabaseConfigured && userId !== null,
    perform: (entry) => performSyncIntent(entry.intent, localDateFromISO(entry.dayISO)),
    load: () => loadSyncQueue(userId),
    save: (queue) => saveSyncQueue(userId, queue),
    now: () => Date.now(),
    isOnline: browserIsOnline,
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (handle) => window.clearTimeout(handle),
    newId: generateId,
    onReconcileNeeded,
  })
}
