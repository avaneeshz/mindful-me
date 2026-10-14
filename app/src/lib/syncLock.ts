/**
 * A cross-tab mutual-exclusion lock for the background sync drain.
 *
 * The retry queue lives in device storage and is shared by every tab of the app,
 * but each tab used to drain it on its own — so a write waiting at the moment
 * two tabs opened was sent by both. Browsers expose this as the Web Locks API;
 * it is wrapped here, in one small adapter, so the rest of the app never touches
 * `navigator` (see CLAUDE.md's portability rules).
 *
 * `run` executes only if no other tab currently holds the lock; the result says
 * whether it did. Where the API is missing (old browsers, tests) it simply runs —
 * the previous behaviour, and still safe because the server now accepts a repeated
 * create of the same id.
 */
const LOCK_NAME = 'mindful-me:sync-drain'

export async function withSyncLock(run: () => Promise<void>): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks || typeof locks.request !== 'function') {
    await run()
    return true
  }
  return locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (!lock) return false
    await run()
    return true
  })
}
