/**
 * When automatic Health Sync runs. Pure rules, no timers — the hook that owns
 * the timer (`state/useHealthAutoSync`) asks these.
 *
 * Every 5 minutes: an automatic sync is usually the light "quick" kind (a few
 * small reads), so checking often keeps today's heart rate close to live.
 */

export const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000
/** Longest wait after repeated failures. */
export const AUTO_SYNC_MAX_BACKOFF_MS = 2 * 60 * 60 * 1000

/** True when the last sync (from any device) is old enough to sync again. */
export function isAutoSyncDue(lastSyncedAt: string | null, nowMs: number): boolean {
  if (!lastSyncedAt) return true
  const last = Date.parse(lastSyncedAt)
  return !Number.isFinite(last) || nowMs - last >= AUTO_SYNC_INTERVAL_MS
}

/**
 * How long to wait before the next check. After a success, until the interval
 * is up since that sync; after failures, the interval doubled per failure, capped.
 */
export function nextAutoSyncDelay(lastSyncedAt: string | null, nowMs: number, failures: number): number {
  if (failures > 0) return Math.min(AUTO_SYNC_INTERVAL_MS * 2 ** failures, AUTO_SYNC_MAX_BACKOFF_MS)
  const last = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN
  if (!Number.isFinite(last)) return AUTO_SYNC_INTERVAL_MS
  const remaining = AUTO_SYNC_INTERVAL_MS - (nowMs - last)
  // Never schedule a check sooner than a minute out: a clock skew between the
  // device and the server shouldn't turn into a tight loop.
  return Math.max(60 * 1000, Math.min(remaining, AUTO_SYNC_INTERVAL_MS))
}
