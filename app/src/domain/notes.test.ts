import { describe, expect, it } from 'vitest'
import {
  canSubmitNote,
  formatNoteTimestamp,
  GIFT_TYPES,
  NOTE_BUTTONS,
  noteButtonLabel,
  requiresGiftType,
  type NoteButtonKey,
} from './notes'

describe('NOTE_BUTTONS', () => {
  it('is the 6 header pills, in render order: Mirror renamed in place, Prayer appended', () => {
    expect(NOTE_BUTTONS.map((button) => button.key)).toEqual([
      'gifts',
      'chits',
      'opportunities',
      'learnings',
      'mirror',
      'prayer',
    ])
    expect(NOTE_BUTTONS.map((button) => button.label)).toEqual([
      'Gifts',
      'Chits',
      'Opportunities',
      'Learnings',
      'Mirror',
      'Prayer',
    ])
  })

  it('never contains "Feedback" — it was renamed to Mirror, not kept alongside it', () => {
    expect(NOTE_BUTTONS.map((button) => button.label)).not.toContain('Feedback')
  })
})

describe('GIFT_TYPES', () => {
  it('is exactly the 5 values from the ticket, in the given order', () => {
    expect(GIFT_TYPES).toEqual(['Dreamer', 'the voice', 'the knower', 'memory bank', 'amplifier'])
  })
})

describe('noteButtonLabel', () => {
  it('resolves every real key to its label', () => {
    for (const { key, label } of NOTE_BUTTONS) {
      expect(noteButtonLabel(key)).toBe(label)
    }
  })
})

describe('requiresGiftType', () => {
  it('is true for gifts only', () => {
    expect(requiresGiftType('gifts')).toBe(true)
    for (const key of ['chits', 'opportunities', 'learnings', 'mirror', 'prayer'] as NoteButtonKey[]) {
      expect(requiresGiftType(key)).toBe(false)
    }
  })
})

describe('canSubmitNote', () => {
  it('rejects an empty or whitespace-only note for every button', () => {
    expect(canSubmitNote('mirror', '', null)).toBe(false)
    expect(canSubmitNote('mirror', '   ', null)).toBe(false)
    expect(canSubmitNote('mirror', '\n\t', null)).toBe(false)
  })

  it('accepts a non-blank note for a non-Gifts button, gift type irrelevant', () => {
    expect(canSubmitNote('prayer', 'Grateful today', null)).toBe(true)
    expect(canSubmitNote('chits', 'Owed a favour', null)).toBe(true)
  })

  it('rejects Gifts with a note but no gift type chosen', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', null)).toBe(false)
  })

  it('accepts Gifts once both a note and a gift type are present', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', 'the voice')).toBe(true)
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
