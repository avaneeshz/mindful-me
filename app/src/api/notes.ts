import { supabase } from '@/lib/supabaseClient'
import type { GiftType, NoteButtonKey, NoteEntry } from '@/domain/notes'

/** The shape `public.note_entry_dto` (see `20260905090000_note_entries.sql`) hands back. */
interface NoteEntryDto {
  id: string
  button_key: string
  note: string
  gift_type: string | null
  created_at: string
}

function dtoToClient(dto: NoteEntryDto): NoteEntry {
  return {
    id: dto.id,
    buttonKey: dto.button_key as NoteButtonKey,
    note: dto.note,
    giftType: (dto.gift_type as GiftType | null) ?? null,
    createdAt: dto.created_at,
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
  giftType: GiftType | null,
): Promise<NoteEntry | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_note_entry', {
    p_button_key: buttonKey,
    p_note: note,
    p_gift_type: giftType,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes] create_note_entry failed — kept locally, will retry on next load', error.message)
    return null
  }
  return dtoToClient(data as NoteEntryDto)
}
