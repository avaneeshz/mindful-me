import { describe, expect, it } from 'vitest'
import { cardNoteWasEdited, MAX_CARD_NOTE_LENGTH, parseCardNotes, sortNotesNewestFirst, validateCardNote } from './reflectionCardNotes'

const note = (id: string, createdAt: string, updatedAt = createdAt) => ({ id, card: 1, note: id, createdAt, updatedAt })

describe('reflectionCardNotes', () => {
  it('rejects empty and over-long notes', () => {
    expect(validateCardNote('  \n ')).not.toBeNull()
    expect(validateCardNote('x'.repeat(MAX_CARD_NOTE_LENGTH + 1))).not.toBeNull()
    expect(validateCardNote(' hello ')).toBeNull()
  })
  it('sorts newest first by written time, not edit time', () => {
    const older = note('a', '2026-11-01T10:00:00Z', '2026-11-03T10:00:00Z')
    const newer = note('b', '2026-11-02T10:00:00Z')
    expect(sortNotesNewestFirst([older, newer]).map((n) => n.id)).toEqual(['b', 'a'])
  })
  it('knows when a note was edited', () => {
    expect(cardNoteWasEdited(note('a', '2026-11-01T10:00:00Z'))).toBe(false)
    expect(cardNoteWasEdited(note('a', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z'))).toBe(true)
  })
  it('drops malformed stored data', () => {
    expect(parseCardNotes(null)).toEqual([])
    expect(parseCardNotes([{ id: 1 }, note('ok', '2026-11-01T10:00:00Z'), 'x'])).toEqual([note('ok', '2026-11-01T10:00:00Z')])
  })
})
