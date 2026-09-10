import type { SunMoonEntry, SunMoonKind } from '@/domain/sunMoonLog'

const STORAGE_PREFIX = 'mindful-me:sunmoon:'

function keyFor(kind: SunMoonKind): string {
  return `${STORAGE_PREFIX}${kind}`
}

/**
 * Local-first (rule 6) persistence for the Sun/Moon light log — one key per
 * kind, holding every stretch ever logged for it, newest first. Plaintext in
 * `localStorage`, same treatment as `noteEntriesLocalStore.ts`: this is a
 * device-only fallback, and there is no backend for it at all today.
 *
 * Both functions fail closed (never throw): a private-browsing tab, a full
 * quota, or storage blocked by policy degrades to this session's in-memory
 * state rather than crashing the app.
 */
export function loadSunMoonEntries(kind: SunMoonKind): SunMoonEntry[] | null {
  try {
    const raw = window.localStorage.getItem(keyFor(kind))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SunMoonEntry[]) : null
  } catch {
    return null
  }
}

export function saveSunMoonEntries(kind: SunMoonKind, entries: readonly SunMoonEntry[]): void {
  try {
    window.localStorage.setItem(keyFor(kind), JSON.stringify(entries))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}
