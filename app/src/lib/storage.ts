/**
 * The one device-storage adapter (MOBILE-READINESS.md MR-1). Synchronous and
 * fail-closed: a private-browsing tab, a full quota or storage blocked by
 * policy reads as "nothing stored" and drops the write, never throws. On a
 * future native app only this file changes (MMKV keeps it synchronous).
 *
 * New code stores through here, never `localStorage` directly. The older
 * `*LocalStore.ts` files still call it themselves until MR-1 moves them over.
 */
export function readStoredJSON(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeStoredJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}
