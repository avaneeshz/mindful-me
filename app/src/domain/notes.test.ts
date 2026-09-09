import { describe, expect, it } from 'vitest'
import {
  canSubmitNote,
  formatNoteTimestamp,
  GIFT_TYPES,
  LEARNING_TYPES,
  NOTE_BUTTONS,
  noteButtonLabel,
  noteButtonTypes,
  PRAYER_TYPES,
  requiresEntryType,
  type NoteButtonKey,
} from './notes'

describe('NOTE_BUTTONS', () => {
  it('is the 7 header pills, in render order — Gifts→Extra Senses, Mirror→Relational Nutrient, Chits/Opportunities gone', () => {
    expect(NOTE_BUTTONS.map((button) => button.key)).toEqual([
      'gifts',
      'learnings',
      'mirror',
      'prayer',
      'scriptures',
      'summons',
      'worship',
    ])
    expect(NOTE_BUTTONS.map((button) => button.label)).toEqual([
      'Extra Senses',
      'Learnings',
      'Relational Nutrient',
      'Prayer',
      'Scriptures',
      'Sermons',
      'Worship Singing',
    ])
  })

  it('no longer carries Chits or Opportunities (moved to the sidebar)', () => {
    const keys = NOTE_BUTTONS.map((button) => button.key) as string[]
    expect(keys).not.toContain('chits')
    expect(keys).not.toContain('opportunities')
  })
})

describe('type enumerations', () => {
  it('GIFT_TYPES is the original 5 values', () => {
    expect(GIFT_TYPES).toEqual(['Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier'])
  })

  it('PRAYER_TYPES is the 7 given values', () => {
    expect(PRAYER_TYPES).toEqual([
      'Adoration',
      'Thanksgiving',
      'Repentance',
      'Seeking forgiveness',
      'Petition/Supplication',
      'Intercession',
      'Contemplation',
    ])
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
  it('offers a type list for gifts, prayer and learnings only', () => {
    expect(noteButtonTypes('gifts')).toBe(GIFT_TYPES)
    expect(noteButtonTypes('prayer')).toBe(PRAYER_TYPES)
    expect(noteButtonTypes('learnings')).toBe(LEARNING_TYPES)
    for (const key of ['mirror', 'scriptures', 'summons', 'worship'] as NoteButtonKey[]) {
      expect(noteButtonTypes(key)).toBeNull()
      expect(requiresEntryType(key)).toBe(false)
    }
  })

  it('requiresEntryType is true for the three typed buttons', () => {
    for (const key of ['gifts', 'prayer', 'learnings'] as NoteButtonKey[]) {
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
    expect(canSubmitNote('prayer', 'Grateful today', '')).toBe(false)
    expect(canSubmitNote('learnings', 'Something new', null)).toBe(false)
  })

  it('accepts a typed button once both a note and a type are present', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', 'The Voice')).toBe(true)
    expect(canSubmitNote('prayer', 'Grateful today', 'Thanksgiving')).toBe(true)
    expect(canSubmitNote('learnings', 'Something new', 'Realized')).toBe(true)
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
