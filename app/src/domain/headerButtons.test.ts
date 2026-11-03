import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEADER_BUTTONS,
  dedupeChecklistItemKey,
  headerButtonConfigFromDto,
  isUuid,
  moveId,
  applyLayout,
  groupHeaderButtons,
  layoutAfterMove,
  layoutFromRows,
  reassignGroup,
  validateGroupName,
  type HeaderButtonGroup,
  partitionHeaderButtons,
  slugifyChecklistItemKey,
  noteLabelsFromFields,
  toDisplayButtonLike,
  withActivityNotes,
  withServerFieldIds,
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
    groupId: null,
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

const GROUPS: HeaderButtonGroup[] = [
  { id: 'g2', name: 'Evening', sortOrder: 1 },
  { id: 'g1', name: 'Morning', sortOrder: 0 },
]

describe('groupHeaderButtons — the rows to render', () => {
  it('lists categories in the user order, each with its own buttons in order', () => {
    const rows = groupHeaderButtons(GROUPS, [
      makeButton({ id: 'a', groupId: 'g1' }),
      makeButton({ id: 'b', groupId: 'g2', category: 'checklist' }),
      makeButton({ id: 'c', groupId: 'g1', category: 'day_value' }),
    ])
    expect(rows.map((r) => [r.group.id, r.buttons.map((b) => b.id)])).toEqual([
      ['g1', ['a', 'c']],
      ['g2', ['b']],
    ])
  })

  it('any mix of the four button types can share a category', () => {
    const [row] = groupHeaderButtons(GROUPS, [
      makeButton({ id: 'n', groupId: 'g1', category: 'notes' }),
      makeButton({ id: 'q', groupId: 'g1', category: 'activity' }),
      makeButton({ id: 'd', groupId: 'g1', category: 'day_value' }),
      makeButton({ id: 'c', groupId: 'g1', category: 'checklist' }),
    ])
    expect(row!.buttons).toHaveLength(4)
  })

  it('shows a button with no category, or a deleted one, in the first category rather than losing it', () => {
    const rows = groupHeaderButtons(GROUPS, [makeButton({ id: 'a', groupId: null }), makeButton({ id: 'b', groupId: 'gone' })])
    expect(rows[0]!.buttons.map((b) => b.id)).toEqual(['a', 'b'])
    expect(rows[1]!.buttons).toEqual([])
  })

  it('returns nothing when there are no categories', () => {
    expect(groupHeaderButtons([], [makeButton({ id: 'a' })])).toEqual([])
  })
})

describe('layoutAfterMove — dragging across categories, and the tap equivalent', () => {
  const layout = [
    { groupId: 'g1', buttonIds: ['a', 'b'] },
    { groupId: 'g2', buttonIds: ['c'] },
  ]

  it('moves a button to another category at a chosen position', () => {
    expect(layoutAfterMove(layout, 'a', 'g2', 0)).toEqual([
      { groupId: 'g1', buttonIds: ['b'] },
      { groupId: 'g2', buttonIds: ['a', 'c'] },
    ])
  })

  it('with no position it goes to the end — what the form Category picker does', () => {
    expect(layoutAfterMove(layout, 'a', 'g2')).toEqual([
      { groupId: 'g1', buttonIds: ['b'] },
      { groupId: 'g2', buttonIds: ['c', 'a'] },
    ])
  })

  it('reorders inside the same category', () => {
    expect(layoutAfterMove(layout, 'a', 'g1', 1)).toEqual([
      { groupId: 'g1', buttonIds: ['b', 'a'] },
      { groupId: 'g2', buttonIds: ['c'] },
    ])
  })

  it('can fill an empty category', () => {
    const withEmpty = [...layout, { groupId: 'g3', buttonIds: [] }]
    expect(layoutAfterMove(withEmpty, 'c', 'g3')[2]).toEqual({ groupId: 'g3', buttonIds: ['c'] })
  })

  it('ignores an unknown category or button', () => {
    expect(layoutAfterMove(layout, 'a', 'nope')).toBe(layout)
    expect(layoutAfterMove(layout, 'zzz', 'g2')).toBe(layout)
  })
})

describe('applyLayout', () => {
  it('sets each laid-out button category and position, and leaves hidden buttons alone', () => {
    const buttons = [
      makeButton({ id: 'a', groupId: 'g1', sortOrder: 0 }),
      makeButton({ id: 'b', groupId: 'g1', sortOrder: 1 }),
      makeButton({ id: 'h', groupId: 'g1', sortOrder: 7, hidden: true }),
    ]
    const next = applyLayout(buttons, [
      { groupId: 'g2', buttonIds: ['b'] },
      { groupId: 'g1', buttonIds: ['a'] },
    ])
    expect(next.map((b) => [b.id, b.groupId, b.sortOrder])).toEqual([
      ['a', 'g1', 1],
      ['b', 'g2', 0],
      ['h', 'g1', 7],
    ])
  })

  it('round-trips with layoutFromRows', () => {
    const buttons = [makeButton({ id: 'a', groupId: 'g1' }), makeButton({ id: 'b', groupId: 'g2' })]
    expect(layoutFromRows(groupHeaderButtons(GROUPS, buttons))).toEqual([
      { groupId: 'g1', buttonIds: ['a'] },
      { groupId: 'g2', buttonIds: ['b'] },
    ])
  })
})

describe('reassignGroup', () => {
  it('moves every button of a deleted category — hidden ones too', () => {
    const next = reassignGroup(
      [makeButton({ id: 'a', groupId: 'g1' }), makeButton({ id: 'b', groupId: 'g1', hidden: true }), makeButton({ id: 'c', groupId: 'g2' })],
      'g1',
      'g2',
    )
    expect(next.map((b) => b.groupId)).toEqual(['g2', 'g2', 'g2'])
  })
})

describe('validateGroupName', () => {
  it('accepts a fresh name', () => {
    expect(validateGroupName('Night', GROUPS)).toBeNull()
  })
  it('rejects blank, over-long and duplicate names', () => {
    expect(validateGroupName('   ', GROUPS)).toMatch(/name/i)
    expect(validateGroupName('x'.repeat(41), GROUPS)).toMatch(/40/)
    expect(validateGroupName(' morning ', GROUPS)).toMatch(/already/i)
  })
  it('lets a category keep its own name when renamed', () => {
    expect(validateGroupName('Morning', GROUPS, 'g1')).toBeNull()
  })
})

describe('note-field ids sent to the server', () => {
  it('recognises real UUIDs only', () => {
    expect(isUuid('cd89f9f7-3f43-4c2d-89c8-28c81d050534')).toBe(true)
    expect(isUuid('CD89F9F7-3F43-4C2D-89C8-28C81D050534')).toBe(true)
    expect(isUuid('cd89f9f7-3f43-4c2d-89c8-28c81d050534:note-primary')).toBe(false)
    expect(isUuid('local-123-abc')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })

  it('drops the placeholder id the screen invents, so the server treats the field as new', () => {
    const fields = [
      { id: 'cd89f9f7-3f43-4c2d-89c8-28c81d050534:note-primary', fieldKind: 'text', label: 'Note' },
      { id: '11111111-2222-4333-8444-555555555555', fieldKind: 'multiselect', label: 'How was it' },
      { fieldKind: 'text', label: 'No id yet' },
    ]
    const sent = withServerFieldIds(fields)
    expect(sent[0].id).toBeUndefined()
    expect(sent[1].id).toBe('11111111-2222-4333-8444-555555555555')
    expect(sent[2].id).toBeUndefined()
    expect(JSON.stringify(sent)).not.toContain('note-primary')
  })

  it('a button with no saved note fields produces a placeholder that is NOT a valid server id (the production failure)', () => {
    const button = DEFAULT_HEADER_BUTTONS.find((b) => b.category === 'activity')
    if (!button) return
    const withNotes = withActivityNotes({ ...button, noteFields: [] }, null)
    const placeholder = withNotes.noteFields.find((f) => f.fieldKind === 'text')
    expect(isUuid(placeholder?.id)).toBe(false)
    expect(withServerFieldIds(withNotes.noteFields).every((f) => f.id === undefined || isUuid(f.id))).toBe(true)
  })
})
