import type { SupplementCompletion } from '@/domain/supplements'

const STORAGE_PREFIX = 'mindful-me:supplements:'

/** Keyed by (checklist button, day) now that more than one checklist can exist — was just `localDate` when Supplements was the only one. */
function keyFor(headerButtonId: string, localDate: string): string {
  return `${STORAGE_PREFIX}${headerButtonId}:${localDate}`
}

/**
 * Rule 6 — every write lands locally first, instantly, regardless of
 * connectivity — mirrors `lib/noteEntriesLocalStore.ts` exactly, keyed by
 * CALENDAR DAY rather than by button (the checklist itself "resets daily" —
 * see `domain/supplements.ts` — so the natural cache key is the day, one
 * small array of only the items actually touched that day). Plaintext in
 * `localStorage`, same as every other locally-cached sensitive field in this
 * app (rule 10's encryption applies to the DB at rest, not this device-only
 * fallback).
 *
 * Both functions fail closed (never throw): a private-browsing tab, a full
 * quota, or storage blocked by policy degrades to "this session's in-memory
 * state only" rather than crashing the app.
 */
export function loadLocalSupplementCompletions(headerButtonId: string, localDate: string): SupplementCompletion[] | null {
  try {
    const raw = window.localStorage.getItem(keyFor(headerButtonId, localDate))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SupplementCompletion[]) : null
  } catch {
    return null
  }
}

export function saveLocalSupplementCompletions(
  headerButtonId: string,
  localDate: string,
  entries: readonly SupplementCompletion[],
): void {
  try {
    window.localStorage.setItem(keyFor(headerButtonId, localDate), JSON.stringify(entries))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}
