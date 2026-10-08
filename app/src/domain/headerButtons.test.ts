import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEADER_BUTTONS,
  dedupeChecklistItemKey,
  headerButtonConfigFromDto,
  moveId,
  orderAfterGroupReorder,
  partitionHeaderButtons,
  slugifyChecklistItemKey,
  noteLabelsFromFields,
  toDisplayButtonLike,
  withActivityNotes,
  type HeaderButtonConfig,
  type HeaderButtonDto,
} from './headerButtons'

function makeButton(overrides: Partial<HeaderButtonConfig>): HeaderButtonConfig {
  return {
    id: 'id',
    category: 'notes',
    key: 'k',
    label: 'Label',
    hidden: false,
    sortOrder: 0,
    activityId: null,
    activityName: null,
    entryMode: 'duration',
    quickLogType: false,
    quickLogTypeLabel: 'Type',
    noteFields: [],
    dayValueUnit: null,
    dayValueTarget: null,
    noteTypes: [],
    checklistItems: [],
    ...overrides,
  }
}

describe('DEFAULT_HEADER_BUTTONS', () => {
  it('mirrors the old hardcoded config verbatim — same keys, same labels, same order', () => {
    // Row 2's original render order: 4 note buttons, then 9 quick-log/day-value
    // buttons, then Supplements — see HeaderBar's own doc comment.
    expect(DEFAULT_HEADER_BUTTONS.map((b) => b.id)).toEqual([
      'gifts', 'learnings', 'mirror', 'scriptures',
      'vipassana', 'steps', 'exercise', 'breathing', 'sleep', 'prayer', 'sermons', 'worship', 'protein',
      'supplements',
    ])
  })

  it('has no duplicate ids', () => {
    const ids = DEFAULT_HEADER_BUTTONS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is sorted by sortOrder already, matching id order', () => {
    const sorted = [...DEFAULT_HEADER_BUTTONS].sort((a, b) => a.sortOrder - b.sortOrder)
    expect(sorted.map((b) => b.id)).toEqual(DEFAULT_HEADER_BUTTONS.map((b) => b.id))
  })

  it('Sleep keeps its two text fields (Note + Dreams) plus a multiselect sleep-quality field, all as ordinary configured noteFields', () => {
    const sleep = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'sleep')!
    expect(sleep.noteFields).toHaveLength(3)
    expect(sleep.noteFields[0]).toMatchObject({ fieldKind: 'text', key: 'primary', label: 'Note' })
    expect(sleep.noteFields[1]).toMatchObject({ fieldKind: 'text', key: 'secondary', label: 'Dreams' })
    expect(sleep.noteFields[2]).toMatchObject({ fieldKind: 'multiselect', key: null, label: 'How was your sleep?' })
    expect(sleep.noteFields[2].options).toHaveLength(11)
    expect(sleep.noteFields[2].options).toContain('Deep Restorative')
  })

  it('Vipassana has no note field, unlike every other quick-log button', () => {
    const vipassana = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'vipassana')!
    expect(vipassana.noteFields).toEqual([])
  })

  it('Supplements carries all 7 fixed items, verbatim', () => {
    const supplements = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'supplements')!
    expect(supplements.checklistItems.map((i) => i.key)).toEqual([
      'zinc', 'omega', 'magnesium', 'ayurveda_skin', 'ayurveda_fibroid', 'ayurveda_varicose', 'multivitamin',
    ])
  })

  it('nothing is hidden by default', () => {
    expect(DEFAULT_HEADER_BUTTONS.every((b) => !b.hidden)).toBe(true)
  })
})

describe('partitionHeaderButtons', () => {
  it('splits visible from hidden and sorts each half by sortOrder', () => {
    const buttons = [
      makeButton({ id: 'b', sortOrder: 2 }),
      makeButton({ id: 'a', sortOrder: 1 }),
      makeButton({ id: 'hidden-1', sortOrder: 0, hidden: true }),
    ]
    const { visible, hidden } = partitionHeaderButtons(buttons)
    expect(visible.map((b) => b.id)).toEqual(['a', 'b'])
    expect(hidden.map((b) => b.id)).toEqual(['hidden-1'])
  })

  it('never drops a button — every input row ends up in exactly one half', () => {
    const buttons = [
      makeButton({ id: 'a', hidden: false }),
      makeButton({ id: 'b', hidden: true }),
      makeButton({ id: 'c', hidden: false }),
    ]
    const { visible, hidden } = partitionHeaderButtons(buttons)
    expect(visible.length + hidden.length).toBe(buttons.length)
  })

  it('handles an empty list without error', () => {
    expect(partitionHeaderButtons([])).toEqual({ visible: [], hidden: [] })
  })
})

describe('slugifyChecklistItemKey', () => {
  it('lowercases and replaces non-alphanumeric runs with a single underscore', () => {
    expect(slugifyChecklistItemKey('Post-Lunch Magnesium!')).toBe('post_lunch_magnesium')
  })

  it('trims leading/trailing underscores', () => {
    expect(slugifyChecklistItemKey('  Drink Water  ')).toBe('drink_water')
  })

  it('collapses to an empty string for a label with no alphanumeric characters', () => {
    expect(slugifyChecklistItemKey('!!!')).toBe('')
  })
})

describe('dedupeChecklistItemKey', () => {
  it('returns the key unchanged when it does not collide', () => {
    expect(dedupeChecklistItemKey('zinc', new Set(['omega']))).toBe('zinc')
  })

  it('appends a numeric suffix on collision, incrementing until unique', () => {
    expect(dedupeChecklistItemKey('zinc', new Set(['zinc']))).toBe('zinc_1')
    expect(dedupeChecklistItemKey('zinc', new Set(['zinc', 'zinc_1']))).toBe('zinc_2')
  })
})

describe('headerButtonConfigFromDto', () => {
  it('maps every field from the server DTO shape, including nested config', () => {
    const dto: HeaderButtonDto = {
      id: 'uuid-1',
      category: 'activity',
      key: null,
      label: 'Exercise',
      sort_order: 6,
      hidden: false,
      activity_id: 'activity-uuid',
      activity_name: 'Sports or Exercise',
      entry_mode: 'duration',
      quick_log_type: true,
      quick_log_type_label: 'Type',
      day_value_unit: null,
      day_value_target: null,
      note_fields: [{ id: 'nf-1', fieldKind: 'text', key: 'primary', label: 'Note', options: [] }],
      note_types: [],
      checklist_items: [],
    }
    const config = headerButtonConfigFromDto(dto)
    expect(config.id).toBe('uuid-1')
    expect(config.activityName).toBe('Sports or Exercise')
    expect(config.noteFields).toEqual([{ id: 'nf-1', fieldKind: 'text', key: 'primary', label: 'Note', options: [] }])
  })

  it('maps the server\'s "song_count" entry_mode to the client\'s "songCount"', () => {
    const dto: HeaderButtonDto = {
      id: 'uuid-2',
      category: 'activity',
      key: null,
      label: 'Worship',
      sort_order: 11,
      hidden: false,
      activity_id: 'activity-uuid-2',
      activity_name: 'Worship',
      entry_mode: 'song_count',
      quick_log_type: false,
      quick_log_type_label: null,
      day_value_unit: null,
      day_value_target: null,
      note_fields: [],
      note_types: [],
      checklist_items: [],
    }
    expect(headerButtonConfigFromDto(dto).entryMode).toBe('songCount')
  })
})

describe('toDisplayButtonLike', () => {
  it('an activity-category button carries its activity name as quickLogName and is never marked synced', () => {
    const button = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'exercise')!
    const like = toDisplayButtonLike(button)
    expect(like.quickLogName).toBe('Sports or Exercise')
    expect(like.synced).toBe(false)
    expect(like.input).toBe('duration')
  })

  it('a day_value-category button carries its own key as storageKey and is marked synced', () => {
    const button = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'protein')!
    const like = toDisplayButtonLike(button)
    expect(like.storageKey).toBe('protein')
    expect(like.synced).toBe(true)
    expect(like.input).toBe('number')
    expect(like.unit).toBe('target')
    expect(like.target).toBe(80)
  })

  it("Worship's songCount entry mode carries through", () => {
    const button = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'worship')!
    expect(toDisplayButtonLike(button).input).toBe('songCount')
  })
})

describe('withActivityNotes — the activity is the source of truth for text notes', () => {
  const sleep = DEFAULT_HEADER_BUTTONS.find((b) => b.noteFields.some((f) => f.key === 'secondary'))!

  it('shows exactly the activity’s notes, keeping the button’s multiselect fields', () => {
    const out = withActivityNotes(sleep, { noteLabel: 'Note', secondNoteLabel: null })
    expect(out.noteFields.filter((f) => f.fieldKind === 'text').map((f) => f.label)).toEqual(['Note'])
    expect(out.noteFields.some((f) => f.fieldKind === 'multiselect')).toBe(true)
  })

  it('always offers a first note, and a second only when the activity has one', () => {
    const plain = makeButton({ category: 'activity', noteFields: [] })
    expect(withActivityNotes(plain, { noteLabel: null, secondNoteLabel: null }).noteFields.map((f) => f.key)).toEqual(['primary'])
    expect(withActivityNotes(plain, { noteLabel: null, secondNoteLabel: 'Gratitude' }).noteFields.map((f) => f.key)).toEqual(['primary', 'secondary'])
  })

  it('leaves non-activity buttons alone', () => {
    const notes = makeButton({ category: 'notes' })
    expect(withActivityNotes(notes, { noteLabel: 'x' })).toBe(notes)
  })

  it('reads text titles back out of a form’s fields', () => {
    expect(noteLabelsFromFields([{ fieldKind: 'text', key: 'primary', label: 'Note' }, { fieldKind: 'text', key: 'secondary', label: 'Dreams' }])).toEqual({ first: 'Note', second: 'Dreams' })
    expect(noteLabelsFromFields([])).toEqual({ first: null, second: null })
  })
})

describe('moveId', () => {
  it('moves an id to a new index', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
  })
  it('clamps the index and ignores unknown ids', () => {
    expect(moveId(['a', 'b'], 'a', 99)).toEqual(['b', 'a'])
    expect(moveId(['a', 'b'], 'z', 0)).toEqual(['a', 'b'])
  })
})

describe('orderAfterGroupReorder', () => {
  const visible = [
    makeButton({ id: 'n1', category: 'notes' }),
    makeButton({ id: 'n2', category: 'notes' }),
    makeButton({ id: 'q1', category: 'activity' }),
    makeButton({ id: 'q2', category: 'day_value' }),
    makeButton({ id: 'c1', category: 'checklist' }),
  ]

  it('reorders one group and keeps the others in place', () => {
    expect(orderAfterGroupReorder(visible, 'quickLog', ['q2', 'q1'])).toEqual(['n1', 'n2', 'q2', 'q1', 'c1'])
    expect(orderAfterGroupReorder(visible, 'notes', ['n2', 'n1'])).toEqual(['n2', 'n1', 'q1', 'q2', 'c1'])
  })

  it('never moves a button into another group', () => {
    expect(orderAfterGroupReorder(visible, 'notes', ['c1', 'n2', 'n1'])).toEqual(['n2', 'n1', 'q1', 'q2', 'c1'])
  })

  it('keeps group members the caller left out', () => {
    expect(orderAfterGroupReorder(visible, 'notes', ['n2'])).toEqual(['n2', 'n1', 'q1', 'q2', 'c1'])
  })
})
