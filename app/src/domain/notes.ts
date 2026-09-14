/**
 * The header pills each open a note-entry surface: write a note, Store it with
 * the current timestamp, see the full history for that button. This module is
 * the pure, DB/React-free heart of that feature — types, the fixed
 * enumerations, and validation — mirroring how `domain/scheduling.ts` keeps
 * shared scheduling logic out of any one component or API call site. No
 * React, no Supabase, no `localStorage` — see `state/useNoteEntries.ts` for
 * where those live.
 *
 * `Extra Senses` (key `gifts`) and `Relational Nutrient` (key `mirror`) are
 * display renames only — their storage keys are unchanged so existing
 * entries and the (unchanged) DB CHECK constraint still line up.
 * `Opportunities` and `Chits` were removed from this row and now live as
 * inert sidebar entries (`components/Sidebar.tsx`). `Scriptures` is new.
 *
 * `Prayer` (key `prayer`), `Sermons` (key `summons`) and `Worship Singing`
 * (key `worship`) are GONE from this row entirely — a confirmed product
 * round replaced them with real time-logging header buttons instead (see
 * `domain/displayButtons.ts`'s `DISPLAY_BUTTONS` and the three new catalog
 * cards in `data/activities.ts`), since a pure freeform note never blocked
 * real time on the Timeline the way every other quick-log button does. Any
 * note entries already stored under those keys stay in the DB untouched —
 * this is a display/entry-point change, not a data migration.
 */

/** The header pills, in the order they render. */
export const NOTE_BUTTONS = [
  { key: 'gifts', label: 'Extra Senses' },
  { key: 'learnings', label: 'Learnings' },
  { key: 'mirror', label: 'Relational Nutrient' },
  { key: 'scriptures', label: 'Scriptures' },
] as const

export type NoteButtonKey = (typeof NOTE_BUTTONS)[number]['key']

/** `Extra Senses` (key `gifts`) — the original five values, unchanged. */
export const GIFT_TYPES = ['Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier'] as const

export type GiftType = (typeof GIFT_TYPES)[number]

/** `Learnings` types. */
export const LEARNING_TYPES = ['Given', 'Realized', 'Revealed'] as const

// `PRAYER_TYPES` (Adoration/Thanksgiving/Repentance/Seeking forgiveness/
// Petition-Supplication/Intercession/Contemplation) lived here as the old
// `prayer` note button's type vocabulary. Now that Prayer is a real
// `DISPLAY_BUTTONS` quick-log button (see `domain/displayButtons.ts`), that
// same 7-value list moved to the `Prayer` catalog card's own `sub` list in
// `data/activities.ts` — `quickLogType`'s options are always drawn from
// there (`findCard(quickLogName)?.sub`), never from this file. Nothing else
// references a Prayer type vocabulary here any more, so the export was
// dropped rather than kept as dead code; the values themselves are not
// lost, just relocated to their new single source of truth.

/**
 * Which buttons carry a single-select "type" chip radiogroup above the note
 * field, and the values each offers. A button absent here has no type
 * selector at all. The stored value is a plain string — see
 * `NoteEntry.entryType`.
 */
export const NOTE_BUTTON_TYPES: Partial<Record<NoteButtonKey, readonly string[]>> = {
  gifts: GIFT_TYPES,
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
  /**
   * Bumped by the DB on every `update_note_entry` (see
   * `20260913070000_note_entries_edit_delete.sql`) — equal to `createdAt`
   * for a note that has never been edited. `noteEntryWasEdited` below is the
   * one place that comparison happens, so the history list never re-derives
   * it inline.
   */
  updatedAt: string
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

/** Whether a note has ever been edited since it was first stored — `updatedAt` only ever moves once `update_note_entry` touches a row. */
export function noteEntryWasEdited(entry: Pick<NoteEntry, 'createdAt' | 'updatedAt'>): boolean {
  return entry.updatedAt !== entry.createdAt
}
