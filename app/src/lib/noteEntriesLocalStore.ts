import type { NoteButtonKey, NoteEntry } from '@/domain/notes'

const STORAGE_PREFIX = 'mindful-me:notes:'

function keyFor(buttonKey: NoteButtonKey): string {
  return `${STORAGE_PREFIX}${buttonKey}`
}

/**
 * Rule 6 — every write lands locally first, instantly, regardless of
 * connectivity — mirrors `state/localPersistence.ts` exactly, just keyed by
 * button rather than by calendar day (a note-entry log has no "day" of its
 * own the way the board does). Plaintext in `localStorage`, same as every
 * other locally-cached sensitive field this app already has
 * (`ScheduledActivity.flags`/`quality`/`symptoms`/`notes` all round-trip
 * through `localPersistence.ts` unencrypted too) — rule 10's encryption
 * applies to the DB at rest, not to this device-only, local-first fallback.
 *
 * Both functions fail closed (never throw): a private-browsing tab, a full
 * quota, or storage blocked by policy degrades to "this session's in-memory
 * state only" rather than crashing the app.
 */
export function loadLocalNoteEntries(buttonKey: NoteButtonKey): NoteEntry[] | null {
  try {
    const raw = window.localStorage.getItem(keyFor(buttonKey))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as NoteEntry[]) : null
  } catch {
    return null
  }
}

export function saveLocalNoteEntries(buttonKey: NoteButtonKey, entries: readonly NoteEntry[]): void {
  try {
    window.localStorage.setItem(keyFor(buttonKey), JSON.stringify(entries))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}
