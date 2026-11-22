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
import { generateId } from '@/domain/scheduling'

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
// there (`firstLevelOptionNames(findCard(quickLogName))` — PICKER-CUSTOM-1
// generalized the underlying `sub` field into an arbitrary-depth `children`
// tree, but this is still the one place that vocabulary is read from),
// never from this file. Nothing else
// references a Prayer type vocabulary here any more, so the export was
// dropped rather than kept as dead code; the values themselves are not
// lost, just relocated to their new single source of truth.

/**
 * Which buttons carry a multi-select "type" chip group above the note
 * field, and the values each offers. A button absent here has no type
 * selector at all. The stored values are plain strings — see
 * `NoteEntry.entryTypes`.
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
  /**
   * The chosen types, in the order picked, for buttons that have a selector;
   * `[]` otherwise. More than one may be chosen (see
   * `20261005060000_note_entries_multi_type.sql`).
   */
  entryTypes: readonly string[]
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

/**
 * Every State Tile opens a full-screen window that holds the header's own
 * kinds of button. A tile's note buttons are ordinary `header_buttons` 'notes'
 * rows (own label, optional types) whose notes are ordinary `note_entries`,
 * with the storage key `tile<card>_<id>` — which is also how buttons made
 * before tiles had a `tile_card` column are recognised.
 */

/** A fresh storage key for a new note button on a State Tile. */
export function newTileNoteKey(card: number): NoteButtonKey {
  return `tile${card}_${generateId().replace(/-/g, '')}`
}

/** The tile a note button's key belongs to, or `null` for a header button. */
export function tileCardFromNoteKey(key: string | null | undefined): number | null {
  const match = key ? /^tile(\d{1,3})_[0-9a-z]+$/.exec(key) : null
  if (!match) return null
  const card = Number(match[1])
  return card >= 1 && card <= 500 ? card : null
}

/** The type values this button offers, or `null` if it has no type selector. */
export function noteButtonTypes(buttonKey: NoteButtonKey): readonly string[] | null {
  const types = (typeRegistry ?? NOTE_BUTTON_TYPES)[buttonKey]
  // A dynamic button with no configured types comes through as `[]` — that
  // means "no selector", exactly like an absent key, never "type required".
  return types && types.length > 0 ? types : null
}

/** Whether this button requires a type to be chosen before Store is allowed. */
export function requiresEntryType(buttonKey: NoteButtonKey): boolean {
  return noteButtonTypes(buttonKey) !== null
}

/**
 * Whether the Store button should be enabled: a real, non-blank note, and —
 * for a button with a type selector — at least one type actually chosen. Shared by the
 * component and any API caller so "what counts as submittable" lives in one
 * place, the same reasoning `domain/scheduling.ts`'s `validateSchedule`
 * follows.
 */
export function canSubmitNote(buttonKey: NoteButtonKey, note: string, entryTypes: readonly string[]): boolean {
  if (note.trim() === '') return false
  if (requiresEntryType(buttonKey) && entryTypes.length === 0) return false
  return true
}

/** Adds `type` to a multi-type selection, or removes it if already picked — keeps pick order. */
export function toggleEntryType(selected: readonly string[], type: string): string[] {
  return selected.includes(type) ? selected.filter((value) => value !== type) : [...selected, type]
}

/** How a note's types read inline (history rows, the day export): "Dreamer, The Voice". */
export function formatEntryTypes(entryTypes: readonly string[]): string {
  return entryTypes.join(', ')
}

/** `Tue, 5 Sep · 3:45 PM`-shaped, device-local — no timezone library needed (mirrors `HeaderBar`'s own date formatting). */
export function formatNoteTimestamp(date: Date): string {
  const datePart = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart} · ${timePart}`
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** A `Date` as the `YYYY-MM-DDTHH:mm` string an `<input type="datetime-local">` holds — device-local wall clock, never UTC-shifted. */
export function toDateTimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** The inverse: a `datetime-local` string read as the device's local wall clock, or `null` if blank/malformed. */
export function parseDateTimeLocalValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  // `new Date` rolls an impossible date (31 Feb) forward — reject it instead.
  const roundTrips = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return roundTrips ? date : null
}

/**
 * Why a chosen note time can't be used, or `null` if it can. A note records
 * something that has happened, so it can't be dated ahead of now (a minute of
 * slack, since the picker only has minute precision). The database enforces the
 * same limit — see `create_note_entry_v4`.
 */
export function noteTimeError(chosen: Date | null, now: Date): string | null {
  if (chosen === null) return 'Enter a valid date and time.'
  if (chosen.getTime() > now.getTime() + 60_000) return 'A note can’t be dated in the future.'
  return null
}

/** Newest first by when the note happened — a back-dated note slots into its place, not the top. */
export function sortNotesNewestFirst(entries: readonly NoteEntry[]): NoteEntry[] {
  return [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
