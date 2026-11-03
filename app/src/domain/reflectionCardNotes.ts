/**
 * Notes written on a State Tile — the rules, as pure functions. The backend
 * enforces the same limit in `create_reflection_card_note`.
 */
export const MAX_CARD_NOTE_LENGTH = 10000

export interface ReflectionCardNote {
  id: string
  /** 1–18, the tile the note was written on. */
  card: number
  note: string
  /** ISO instants (UTC); shown in the viewer's own time zone. */
  createdAt: string
  updatedAt: string
}

export function validateCardNote(raw: string): string | null {
  const note = raw.trim()
  if (note === '') return 'Write something first.'
  if (note.length > MAX_CARD_NOTE_LENGTH) return `Keep it to ${MAX_CARD_NOTE_LENGTH.toLocaleString()} characters or fewer.`
  return null
}

/** Newest first, by when the note was written (an edit doesn't move it). */
export function sortNotesNewestFirst(notes: readonly ReflectionCardNote[]): ReflectionCardNote[] {
  return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Whether the note was changed after it was first written. */
export function cardNoteWasEdited(note: Pick<ReflectionCardNote, 'createdAt' | 'updatedAt'>): boolean {
  return note.updatedAt !== note.createdAt
}

export function parseCardNotes(value: unknown): ReflectionCardNote[] {
  if (!Array.isArray(value)) return []
  const out: ReflectionCardNote[] = []
  for (const v of value) {
    if (typeof v !== 'object' || v === null) continue
    const r = v as Record<string, unknown>
    if (
      typeof r.id === 'string' &&
      typeof r.card === 'number' &&
      typeof r.note === 'string' &&
      typeof r.createdAt === 'string' &&
      typeof r.updatedAt === 'string'
    ) {
      out.push({ id: r.id, card: r.card, note: r.note, createdAt: r.createdAt, updatedAt: r.updatedAt })
    }
  }
  return sortNotesNewestFirst(out)
}
