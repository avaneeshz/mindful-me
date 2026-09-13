import { supabase } from '@/lib/supabaseClient'
import type { NoteButtonKey, NoteEntry } from '@/domain/notes'

/**
 * The shape `public.note_entry_dto` hands back (see
 * `20260905090000_note_entries.sql`; `updated_at` added by
 * `20260913070000_note_entries_edit_delete.sql`).
 */
interface NoteEntryDto {
  id: string
  button_key: string
  note: string
  gift_type: string | null
  created_at: string
  updated_at: string
}

function dtoToClient(dto: NoteEntryDto): NoteEntry {
  return {
    id: dto.id,
    buttonKey: dto.button_key as NoteButtonKey,
    note: dto.note,
    // The server column is still `gift_type` (unchanged contract); the client
    // field is the generic `entryType` now that Prayer/Learnings feed it too.
    entryType: dto.gift_type ?? null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

/**
 * "Show the complete history for a button" — every stored note for one
 * button, newest first. Returns `null` (never `[]`) on any failure to
 * reach/read the server, mirroring `apiListScheduledActivities`, so a caller
 * can tell "genuinely no notes yet" from "couldn't check" and knows not to
 * overwrite the local-first list in the latter case.
 */
export async function apiListNoteEntries(buttonKey: NoteButtonKey): Promise<NoteEntry[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_note_entries', { p_button_key: buttonKey })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes] list_note_entries failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as NoteEntryDto[]).map(dtoToClient)
}

/**
 * Stores a note with the current server timestamp (rule 3 territory doesn't
 * apply here — these aren't wall-clock scheduled activities — but "the
 * current timestamp" is still always the server's own clock at insert,
 * never client-supplied; see the migration). Returns `null` on failure (no
 * backend configured, or the write didn't reach the server) rather than
 * throwing — the caller already holds the local-first copy (rule 6) and
 * treats a `null` as "still saved on this device, sync will retry later".
 */
export async function apiCreateNoteEntry(
  buttonKey: NoteButtonKey,
  note: string,
  entryType: string | null,
): Promise<NoteEntry | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_note_entry', {
    p_button_key: buttonKey,
    p_note: note,
    p_gift_type: entryType,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes] create_note_entry failed — kept locally, will retry on next load', error.message)
    return null
  }
  return dtoToClient(data as NoteEntryDto)
}

/**
 * Edits an existing note's text (and, for a typed button, its type) in
 * place — `20260913070000_note_entries_edit_delete.sql`'s `update_note_entry`.
 * Returns `null` on failure to reach/read the server (no backend configured,
 * or the write didn't land), same fail-open contract as `apiCreateNoteEntry`
 * — the caller keeps its own local-first optimistic edit either way.
 */
export async function apiUpdateNoteEntry(
  id: string,
  note: string,
  entryType: string | null,
): Promise<NoteEntry | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('update_note_entry', {
    p_id: id,
    p_note: note,
    p_gift_type: entryType,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes] update_note_entry failed — kept locally, will retry on next load', error.message)
    return null
  }
  return dtoToClient(data as NoteEntryDto)
}

/**
 * Removes a note from the user's view (rule 11 — soft-deleted server-side,
 * recoverable for 30 days, then purged; never a real DELETE from here).
 * Returns `true` once the request has succeeded; `false` when there was
 * nothing to reach or the write didn't land — the caller has already
 * removed the entry from its own local-first list regardless of this
 * result, mirroring every other `api/*` write's "local-first, background
 * sync" contract.
 */
export async function apiDeleteNoteEntry(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('delete_note_entry', { p_id: id })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes] delete_note_entry failed — removed locally, will retry on next load', error.message)
    return false
  }
  return true
}

/**
 * Every note entry (any button) whose `created_at` falls inside
 * `[rangeStart, rangeEnd)` — real instants, e.g. `lib/localTime.ts`'s
 * `localDayRange(viewedDate)` — for the "download this day's data" export.
 * Unlike `apiListNoteEntries` (one button's whole history), this is scoped to
 * a window (rule 8) and spans every button in one round trip. Returns `null`
 * on any failure to reach/read the server — same fail-open contract as every
 * other `api/*` read here — so a caller (the export assembly) can complete
 * the rest of the document from whatever it already has (rule 6) rather than
 * block the whole export on this one optional section.
 */
export async function apiListNoteEntriesForDate(rangeStart: Date, rangeEnd: Date): Promise<NoteEntry[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_note_entries_for_date', {
    p_range_start: rangeStart.toISOString(),
    p_range_end: rangeEnd.toISOString(),
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes] list_note_entries_for_date failed — export will omit note entries', error.message)
    return null
  }
  return ((data ?? []) as NoteEntryDto[]).map(dtoToClient)
}
