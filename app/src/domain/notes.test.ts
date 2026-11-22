import { describe, expect, it } from 'vitest'
import {
  canSubmitNote,
  formatEntryTypes,
  formatNoteTimestamp,
  GIFT_TYPES,
  newTileNoteKey,
  tileCardFromNoteKey,
  LEARNING_TYPES,
  NOTE_BUTTONS,
  noteButtonLabel,
  noteButtonTypes,
  noteEntryWasEdited,
  noteTimeError,
  parseDateTimeLocalValue,
  sortNotesNewestFirst,
  toDateTimeLocalValue,
  partitionNoteEntriesByToday,
  requiresEntryType,
  setNoteButtonTypesRegistry,
  toggleEntryType,
  type NoteButtonKey,
  type NoteEntry,
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

  it('treats a dynamic button with an empty type list as untyped, so Store only needs a note', () => {
    setNoteButtonTypesRegistry({ custom: [] })
    try {
      expect(noteButtonTypes('custom')).toBeNull()
      expect(requiresEntryType('custom')).toBe(false)
      expect(canSubmitNote('custom', 'hello', [])).toBe(true)
    } finally {
      setNoteButtonTypesRegistry(null)
    }
  })
})

describe('canSubmitNote', () => {
  it('rejects an empty or whitespace-only note for every button', () => {
    expect(canSubmitNote('mirror', '', [])).toBe(false)
    expect(canSubmitNote('mirror', '   ', [])).toBe(false)
    expect(canSubmitNote('mirror', '\n\t', [])).toBe(false)
  })

  it('accepts a non-blank note for an untyped button, entry type irrelevant', () => {
    expect(canSubmitNote('mirror', 'A conversation', [])).toBe(true)
    expect(canSubmitNote('scriptures', 'A verse', [])).toBe(true)
  })

  it('rejects a typed button with a note but no type chosen', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', [])).toBe(false)
    expect(canSubmitNote('learnings', 'Something new', [])).toBe(false)
  })

  it('accepts a typed button once both a note and a type are present', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', ['The Voice'])).toBe(true)
    expect(canSubmitNote('learnings', 'Something new', ['Realized'])).toBe(true)
  })

  it('accepts several types at once on a typed button', () => {
    expect(canSubmitNote('gifts', 'A gift I noticed', ['Dreamer', 'The Voice'])).toBe(true)
  })
})

describe('toggleEntryType', () => {
  it('adds an unpicked type at the end, keeping pick order', () => {
    expect(toggleEntryType(['The Voice'], 'Dreamer')).toEqual(['The Voice', 'Dreamer'])
  })

  it('removes an already-picked type', () => {
    expect(toggleEntryType(['The Voice', 'Dreamer'], 'The Voice')).toEqual(['Dreamer'])
  })

  it('does not mutate the input', () => {
    const selected = ['Dreamer']
    toggleEntryType(selected, 'Amplifier')
    expect(selected).toEqual(['Dreamer'])
  })
})

describe('formatEntryTypes', () => {
  it('joins types in pick order', () => {
    expect(formatEntryTypes(['Dreamer', 'The Voice'])).toBe('Dreamer, The Voice')
    expect(formatEntryTypes([])).toBe('')
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

describe('partitionNoteEntriesByToday', () => {
  const TODAY = new Date(2026, 8, 14, 12, 0) // Mon, 14 Sep 2026, noon local

  function entry(id: string, createdAt: string): NoteEntry {
    return { id, buttonKey: 'mirror', note: `note ${id}`, entryTypes: [], createdAt, updatedAt: createdAt }
  }

  it('returns both halves empty for an empty list', () => {
    expect(partitionNoteEntriesByToday([], TODAY)).toEqual({ recent: [], earlier: [] })
  })

  it('puts every entry in recent when all were created today', () => {
    const entries = [entry('a', '2026-09-14T23:59:00.000'), entry('b', '2026-09-14T00:00:00.000')]
    const { recent, earlier } = partitionNoteEntriesByToday(entries, TODAY)
    expect(recent).toEqual(entries)
    expect(earlier).toEqual([])
  })

  it('puts every entry in earlier when all were created before today', () => {
    const entries = [entry('a', '2026-09-13T10:00:00.000'), entry('b', '2026-01-01T00:00:00.000')]
    const { recent, earlier } = partitionNoteEntriesByToday(entries, TODAY)
    expect(recent).toEqual([])
    expect(earlier).toEqual(entries)
  })

  it('splits a mix, preserving the input order within each half', () => {
    const today1 = entry('today1', '2026-09-14T08:00:00.000')
    const yesterday = entry('yesterday', '2026-09-13T08:00:00.000')
    const today2 = entry('today2', '2026-09-14T18:00:00.000')
    const lastMonth = entry('lastMonth', '2026-08-01T08:00:00.000')
    const { recent, earlier } = partitionNoteEntriesByToday([today1, yesterday, today2, lastMonth], TODAY)
    expect(recent).toEqual([today1, today2])
    expect(earlier).toEqual([yesterday, lastMonth])
  })

  it('a future-dated entry (clock skew or timezone edge) is never counted as today unless it truly falls on the same local day', () => {
    const tomorrow = entry('tomorrow', '2026-09-15T00:30:00.000')
    const { recent, earlier } = partitionNoteEntriesByToday([tomorrow], TODAY)
    expect(recent).toEqual([])
    expect(earlier).toEqual([tomorrow])
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

describe('state tile note buttons', () => {
  it('mints keys that map back to their tile', () => {
    const key = newTileNoteKey(9)
    expect(key).toMatch(/^tile9_[0-9a-f]{32}$/)
    expect(tileCardFromNoteKey(key)).toBe(9)
    expect(newTileNoteKey(9)).not.toBe(key)
  })

  it('treats header button keys as not belonging to any tile', () => {
    for (const key of ['gifts', 'user_abc123', 'tile_9', 'tile0_ab', 'tile501_ab', 'tile9_', 'xtile9_ab', null, undefined]) {
      expect(tileCardFromNoteKey(key)).toBeNull()
    }
  })

  it('recognises custom tiles (numbers above 18) too', () => {
    expect(tileCardFromNoteKey('tile19_ab')).toBe(19)
    expect(tileCardFromNoteKey('tile500_ab')).toBe(500)
  })
})

describe('note date and time', () => {
  it('round-trips a device-local wall-clock time through the datetime-local format', () => {
    const date = new Date(2026, 10, 22, 9, 5)
    expect(toDateTimeLocalValue(date)).toBe('2026-11-22T09:05')
    expect(parseDateTimeLocalValue('2026-11-22T09:05')?.getTime()).toBe(date.getTime())
  })

  it('rejects blank, malformed and impossible values', () => {
    for (const value of ['', '2026-11-22', '2026-02-31T10:00', 'nope']) {
      expect(parseDateTimeLocalValue(value)).toBeNull()
    }
  })

  it('allows a time up to now and in the past, but not the future', () => {
    const now = new Date(2026, 10, 22, 12, 0)
    expect(noteTimeError(new Date(2026, 10, 21, 8, 0), now)).toBeNull()
    expect(noteTimeError(new Date(2026, 10, 22, 12, 0), now)).toBeNull()
    expect(noteTimeError(new Date(2026, 10, 22, 12, 30), now)).toMatch(/future/)
    expect(noteTimeError(null, now)).toMatch(/valid/)
  })

  it('sorts newest first by when the note happened', () => {
    const entry = (id: string, createdAt: string): NoteEntry => ({
      id,
      buttonKey: 'gifts',
      note: id,
      entryTypes: [],
      createdAt,
      updatedAt: createdAt,
    })
    const sorted = sortNotesNewestFirst([
      entry('old', '2026-11-20T10:00:00.000Z'),
      entry('new', '2026-11-22T10:00:00.000Z'),
      entry('mid', '2026-11-21T10:00:00.000Z'),
    ])
    expect(sorted.map((e) => e.id)).toEqual(['new', 'mid', 'old'])
  })
})
