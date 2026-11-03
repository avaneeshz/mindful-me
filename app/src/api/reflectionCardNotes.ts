import { supabase } from '@/lib/supabaseClient'
import type { ReflectionCardNote } from '@/domain/reflectionCardNotes'

interface NoteDto {
  id: string
  card_number: number
  note: string
  created_at: string
  updated_at: string
}

const toNote = (d: NoteDto): ReflectionCardNote => ({
  id: d.id,
  card: d.card_number,
  note: d.note,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
})

/** Every note on one tile, newest first. `null` (never `[]`) when the server couldn't be read. */
export async function apiListReflectionCardNotes(card: number): Promise<ReflectionCardNote[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_reflection_card_notes', { p_card: card })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[reflectionCardNotes] list failed', error.message)
    return null
  }
  return ((data ?? []) as NoteDto[]).map(toNote)
}

export type SaveNoteResult = { ok: true; note: ReflectionCardNote } | { ok: false; reason: 'invalid' | 'unreachable' }

function fail(error: { message: string }): SaveNoteResult {
  const invalid = ['note_required', 'note_too_long', 'invalid_card', 'invalid_note', 'note_not_found']
  return { ok: false, reason: invalid.some((c) => error.message.includes(c)) ? 'invalid' : 'unreachable' }
}

/** `id` is minted on the device, so a retry after a lost reply returns the same note. */
export async function apiCreateReflectionCardNote(id: string, card: number, note: string): Promise<SaveNoteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { data, error } = await supabase.rpc('create_reflection_card_note', { p_id: id, p_card: card, p_note: note })
  return error ? fail(error) : { ok: true, note: toNote(data as NoteDto) }
}

export async function apiUpdateReflectionCardNote(id: string, note: string): Promise<SaveNoteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { data, error } = await supabase.rpc('update_reflection_card_note', { p_id: id, p_note: note })
  return error ? fail(error) : { ok: true, note: toNote(data as NoteDto) }
}
