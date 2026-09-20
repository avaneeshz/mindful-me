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
import { isSameLocalDay } from '@/lib/localTime'

/** The header pills, in the order they render — the local-only / pre-fetch fallback; see `domain/headerButtons.ts`'s `DEFAULT_HEADER_BUTTONS` for the unified shape this mirrors. */
export const NOTE_BUTTONS = [
  { key: 'gifts', label: 'Extra Senses' },
  { key: 'learnings', label: 'Learnings' },
  { key: 'mirror', label: 'Relational Nutrient' },
  { key: 'scriptures', label: 'Scriptures' },
] as const

export type NoteButtonKey = string

/**
 * Populated once `state/useHeaderButtons.ts` has resolved the effective
 * per-user 'notes' button list — every lookup below reads through this when
 * it's set, falling back to the hardcoded `NOTE_BUTTONS` before that first
 * resolution (or with no backend configured at all, rule 6). `null` clears
 * it back to the hardcoded default list.
 */
let registry: readonly { key: string; label: string }[] | null = null

export function setNoteButtonsRegistry(buttons: readonly { key: string; label: string }[] | null): void {
  registry = buttons
}

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
export const NOTE_BUTTON_TYPES: Partial<Record<string, readonly string[]>> = {
  gifts: GIFT_TYPES,
  learnings: LEARNING_TYPES,
}

/**
 * A dynamic button's own type vocabulary (`header_button_note_types`),
 * keyed the same way `NOTE_BUTTON_TYPES` is — set alongside the registry
 * above so `noteButtonTypes` below can read through either source uniformly.
 */
let typeRegistry: Partial<Record<string, readonly string[]>> | null = null

export function setNoteButtonTypesRegistry(types: Partial<Record<string, readonly string[]>> | null): void {
  typeRegistry = types
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
  return (registry ?? NOTE_BUTTONS).find((button) => button.key === key)?.label ?? key
}

/** The type values this button offers, or `null` if it has no type selector. */
export function noteButtonTypes(buttonKey: NoteButtonKey): readonly string[] | null {
  return (typeRegistry ?? NOTE_BUTTON_TYPES)[buttonKey] ?? null
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

/**
 * Splits a note-entry list (any order) into those created on `today`'s local
 * calendar day ("Recent") and everything else ("History") — the two-section
 * split every header note pill's popover uses. Relative order within each
 * half is preserved from the input list, so a caller that already sorted
 * `entries` (newest-first, as `useNoteEntries` does) gets both halves in that
 * same order back. There is no `viewedDate` concept for notes at all (unlike
 * a `ScheduledActivity`) — the caller decides what "today" means; the real
 * header pill always passes the actual device-current day.
 */
export function partitionNoteEntriesByToday(
  entries: readonly NoteEntry[],
  today: Date,
): { recent: NoteEntry[]; earlier: NoteEntry[] } {
  const recent: NoteEntry[] = []
  const earlier: NoteEntry[] = []
  for (const entry of entries) {
    if (isSameLocalDay(new Date(entry.createdAt), today)) {
      recent.push(entry)
    } else {
      earlier.push(entry)
    }
  }
  return { recent, earlier }
}
