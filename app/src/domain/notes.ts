/**
 * The header pills each open a note-entry surface: write a note, Store it with
 * the current timestamp, see the full history for that button. This module is
 * the pure, DB/React-free heart of that feature — types, the fixed
 * enumerations, and validation — mirroring how `domain/scheduling.ts` keeps
 * shared scheduling logic out of any one component or API call site. No
 * React, no Supabase, no `localStorage` — see `state/useNoteEntries.ts` for
 * where those live.
 *
 * `Extra Senses` (key `gifts`), `Relational Nutrient` (key `mirror`),
 * `Sermons` (key `summons`) and `Worship Singing` (key `worship`) are display
 * renames only — their storage keys are unchanged so existing entries and the
 * (unchanged) DB CHECK constraint still line up. `Opportunities` and `Chits`
 * were removed from this row and now live as inert sidebar entries
 * (`components/Sidebar.tsx`). `Scriptures` / `Sermons` / `Worship Singing` are new.
 */

/** The header pills, in the order they render. */
export const NOTE_BUTTONS = [
  { key: 'gifts', label: 'Extra Senses' },
  { key: 'learnings', label: 'Learnings' },
  { key: 'mirror', label: 'Relational Nutrient' },
  { key: 'prayer', label: 'Prayer' },
  { key: 'scriptures', label: 'Scriptures' },
  { key: 'summons', label: 'Sermons' },
  { key: 'worship', label: 'Worship Singing' },
] as const

export type NoteButtonKey = (typeof NOTE_BUTTONS)[number]['key']

/** `Extra Senses` (key `gifts`) — the original five values, unchanged. */
export const GIFT_TYPES = ['Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier'] as const

export type GiftType = (typeof GIFT_TYPES)[number]

/** `Prayer` types. */
export const PRAYER_TYPES = [
  'Adoration',
  'Thanksgiving',
  'Repentance',
  'Seeking forgiveness',
  'Petition/Supplication',
  'Intercession',
  'Contemplation',
] as const

/** `Learnings` types. */
export const LEARNING_TYPES = ['Given', 'Realized', 'Revealed'] as const

/**
 * Which buttons carry a single-select "type" chip radiogroup above the note
 * field, and the values each offers. A button absent here has no type
 * selector at all. The stored value is a plain string (three different lists
 * feed it) — see `NoteEntry.entryType`.
 */
export const NOTE_BUTTON_TYPES: Partial<Record<NoteButtonKey, readonly string[]>> = {
  gifts: GIFT_TYPES,
  prayer: PRAYER_TYPES,
  learnings: LEARNING_TYPES,
}

/** One stored note, as the client sees it. */
export interface NoteEntry {
  id: string
  buttonKey: NoteButtonKey
  note: string
  /** The chosen type for buttons that have a selector (`gifts`/`prayer`/`learnings`); `null` otherwise. */
  entryType: string | null
  createdAt: string
}

export function noteButtonLabel(key: NoteButtonKey): string {
  return NOTE_BUTTONS.find((button) => button.key === key)?.label ?? key
}

/** The type values this button offers, or `null` if it has no type selector. */
export function noteButtonTypes(buttonKey: NoteButtonKey): readonly string[] | null {
  return NOTE_BUTTON_TYPES[buttonKey] ?? null
}

/** Whether this button requires a type to be chosen before Store is allowed. */
export function requiresEntryType(buttonKey: NoteButtonKey): boolean {
  return noteButtonTypes(buttonKey) !== null
}

/**
 * Whether the Store button should be enabled: a real, non-blank note, and —
 * for a button with a type selector — a type actually chosen. Shared by the
 * component and any API caller so "what counts as submittable" lives in one
 * place, the same reasoning `domain/scheduling.ts`'s `validateSchedule`
 * follows.
 */
export function canSubmitNote(buttonKey: NoteButtonKey, note: string, entryType: string | null): boolean {
  if (note.trim() === '') return false
  if (requiresEntryType(buttonKey) && (entryType === null || entryType === '')) return false
  return true
}

/** `Tue, 5 Sep · 3:45 PM`-shaped, device-local — no timezone library needed (mirrors `HeaderBar`'s own date formatting). */
export function formatNoteTimestamp(date: Date): string {
  const datePart = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart} · ${timePart}`
}
