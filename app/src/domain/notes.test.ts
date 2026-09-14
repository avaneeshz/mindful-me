import { describe, expect, it } from 'vitest'
import {
  canSubmitNote,
  formatNoteTimestamp,
  GIFT_TYPES,
  LEARNING_TYPES,
  NOTE_BUTTONS,
  noteButtonLabel,
  noteButtonTypes,
  noteEntryWasEdited,
  requiresEntryType,
  type NoteButtonKey,
} from './notes'

describe('NOTE_BUTTONS', () => {
  it('is the 4 header pills, in render order — Gifts→Extra Senses, Mirror→Relational Nutrient, Chits/Opportunities gone, Prayer/Sermons/Worship promoted to real quick-log buttons', () => {
    expect(NOTE_BUTTONS.map((button) => button.key)).toEqual(['gifts', 'learnings', 'mirror', 'scriptures'])
    expect(NOTE_BUTTONS.map((button) => button.label)).toEqual([
      'Extra Senses',
      'Learnings',
      'Relational Nutrient',
      'Scriptures',
    ])
  })

  it('no longer carries Chits or Opportunities (moved to the sidebar)', () => {
    const keys = NOTE_BUTTONS.map((button) => button.key) as string[]
    expect(keys).not.toContain('chits')
    expect(keys).not.toContain('opportunities')
  })

  it('no longer carries Prayer, Sermons or Worship (promoted to real DISPLAY_BUTTONS quick-log buttons)', () => {
    const keys = NOTE_BUTTONS.map((button) => button.key) as string[]
    expect(keys).not.toContain('prayer')
    expect(keys).not.toContain('summons')
    expect(keys).not.toContain('worship')
  })
})

describe('type enumerations', () => {
  it('GIFT_TYPES is the original 5 values', () => {
    expect(GIFT_TYPES).toEqual(['Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier'])
  })

  it('LEARNING_TYPES is Given / Realized / Revealed', () => {
    expect(LEARNING_TYPES).toEqual(['Given', 'Realized', 'Revealed'])
  })
})

describe('noteButtonLabel', () => {
  it('resolves every real key to its label', () => {
    for (const { key, label } of NOTE_BUTTONS) {
      expect(noteButtonLabel(key)).toBe(label)
    }
  })
})

describe('noteButtonTypes / requiresEntryType', () => {
  it('offers a type list for gifts and learnings only', () => {
    expect(noteButtonTypes('gifts')).toBe(GIFT_TYPES)
    expect(noteButtonTypes('learnings')).toBe(LEARNING_TYPES)
    for (const key of ['mirror', 'scriptures'] as NoteButtonKey[]) {
      expect(noteButtonTypes(key)).toBeNull()
      expect(requiresEntryType(key)).toBe(false)
    }
  })

  it('requiresEntryType is true for the two typed buttons', () => {
    for (const key of ['gifts', 'learnings'] as NoteButtonKey[]) {
      expect(requiresEntryType(key)).toBe(true)
    }
  })
})

describe('canSubmitNote', () => {
  it('rejects an empty or whitespace-only note for every button', () => {
    expect(canSubmitNote('mirror', '', null)).toBe(false)
    expect(canSubmitNote('mirror', '   ', null)).toBe(false)
    expect(canSubmitNote('mirror', '\n\t', null)).toBe(false)
  })

  it('accepts a non-blank note for an untyped button, entry type irrelevant', () => {
    expect(canSubmitNote('mirror', 'A conversation', null)).toBe(true)
    expect(canSubmitNote('scriptures', 'A verse', null)).toBe(true)
  })

  it('rejects a typed button with a note but no type chosen', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', null)).toBe(false)
    expect(canSubmitNote('learnings', 'Something new', null)).toBe(false)
  })

  it('accepts a typed button once both a note and a type are present', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', 'The Voice')).toBe(true)
    expect(canSubmitNote('learnings', 'Something new', 'Realized')).toBe(true)
  })
})

describe('noteEntryWasEdited', () => {
  it('is false when updatedAt still equals createdAt (never edited)', () => {
    expect(
      noteEntryWasEdited({ createdAt: '2026-09-11T10:00:00.000Z', updatedAt: '2026-09-11T10:00:00.000Z' }),
    ).toBe(false)
  })

  it('is true once updatedAt has moved past createdAt', () => {
    expect(
      noteEntryWasEdited({ createdAt: '2026-09-11T10:00:00.000Z', updatedAt: '2026-09-11T10:05:00.000Z' }),
    ).toBe(true)
  })
})

describe('formatNoteTimestamp', () => {
  it('renders a weekday/month/day and a time, joined by a separator', () => {
    const formatted = formatNoteTimestamp(new Date(2026, 8, 5, 15, 45))
    expect(formatted).toContain('Sep')
    expect(formatted).toContain('5')
    expect(formatted).toMatch(/3:45/)
    expect(formatted).toContain('·')
  })
})
