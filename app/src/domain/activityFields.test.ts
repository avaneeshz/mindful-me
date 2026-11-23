import { describe, expect, it } from 'vitest'
import {
  fieldsForActivity,
  isFieldLabelTaken,
  hasFieldValues,
  isOptionLabelTaken,
  recordedFields,
  loggableFields,
  moveId,
  normalizeFieldValues,
  rootActivityId,
  validateFieldLabel,
  visibleOptions,
  withText,
  withToggledLabel,
  type ActivityField,
} from './activityFields'

const field = (over: Partial<ActivityField> & { id: string }): ActivityField => ({
  activityId: 'run',
  kind: 'text',
  label: 'Notes',
  sortOrder: 0,
  hidden: false,
  legacyKey: null,
  options: [],
  ...over,
})

const rows = [
  { id: 'run', parentId: null },
  { id: 'trail', parentId: 'run' },
  { id: 'hill', parentId: 'trail' },
]

describe('validateFieldLabel', () => {
  it('rejects blank and over-long titles, accepts the rest', () => {
    expect(validateFieldLabel('   ')).toMatch(/title/)
    expect(validateFieldLabel('x'.repeat(61))).toMatch(/60/)
    expect(validateFieldLabel(' Gratitude ')).toBeNull()
  })
})

describe('label clashes', () => {
  const fields = [field({ id: 'a', label: 'Gratitude' }), field({ id: 'b', label: 'Mood', hidden: true }), field({ id: 'c', activityId: 'walk', label: 'Insight' })]
  it('ignores case and surrounding space, counts hidden fields, stays within one activity', () => {
    expect(isFieldLabelTaken(fields, 'run', ' gratitude ')).toBe(true)
    expect(isFieldLabelTaken(fields, 'run', 'mood')).toBe(true)
    expect(isFieldLabelTaken(fields, 'run', 'Insight')).toBe(false)
  })
  it('lets a field keep its own title when renaming', () => {
    expect(isFieldLabelTaken(fields, 'run', 'Gratitude', 'a')).toBe(false)
  })
  it('checks options within one field', () => {
    const f = field({ id: 'm', kind: 'multiselect', options: [{ id: 'o1', label: 'Calm', sortOrder: 0, hidden: true }] })
    expect(isOptionLabelTaken(f, 'calm')).toBe(true)
    expect(isOptionLabelTaken(f, 'Calm', 'o1')).toBe(false)
    expect(isOptionLabelTaken(f, 'Tense')).toBe(false)
  })
})

describe('subtypes use their parent’s fields', () => {
  it('resolves any depth to the top-level activity', () => {
    expect(rootActivityId(rows, 'hill')).toBe('run')
    expect(rootActivityId(rows, 'run')).toBe('run')
    expect(rootActivityId(rows, 'unknown')).toBe('unknown')
  })
  it('returns the root’s fields in order, hiding hidden ones unless asked', () => {
    const fields = [
      field({ id: 'b', label: 'B', sortOrder: 1 }),
      field({ id: 'a', label: 'A', sortOrder: 0 }),
      field({ id: 'h', label: 'H', sortOrder: 2, hidden: true }),
      field({ id: 'x', activityId: 'other', label: 'X' }),
    ]
    expect(fieldsForActivity(fields, rows, 'hill').map((f) => f.id)).toEqual(['a', 'b'])
    expect(fieldsForActivity(fields, rows, 'trail', { includeHidden: true }).map((f) => f.id)).toEqual(['a', 'b', 'h'])
  })
  it('hides hidden options from the picker only', () => {
    const f = field({
      id: 'm',
      kind: 'multiselect',
      options: [
        { id: '2', label: 'B', sortOrder: 1, hidden: false },
        { id: '1', label: 'A', sortOrder: 0, hidden: false },
        { id: '3', label: 'C', sortOrder: 2, hidden: true },
      ],
    })
    expect(visibleOptions(f).map((o) => o.label)).toEqual(['A', 'B'])
  })
})

describe('values', () => {
  it('sets and clears note text', () => {
    const v = withText({}, 'n', 'hello')
    expect(v).toEqual({ n: { text: 'hello', labels: [] } })
    expect(withText(v, 'n', '  ')).toEqual({})
  })
  it('toggles labels and drops an emptied field', () => {
    let v = withToggledLabel({}, 'm', 'Calm')
    v = withToggledLabel(v, 'm', 'Tense')
    expect(v.m!.labels).toEqual(['Calm', 'Tense'])
    v = withToggledLabel(withToggledLabel(v, 'm', 'Calm'), 'm', 'Tense')
    expect(v).toEqual({})
  })
  it('normalizes: unknown fields and empties are dropped, labels deduplicated', () => {
    const fields = [{ id: 'n', kind: 'text' as const }, { id: 'm', kind: 'multiselect' as const }]
    expect(
      normalizeFieldValues(
        { n: { text: ' ', labels: [] }, m: { text: null, labels: ['A', 'A', 'B'] }, gone: { text: 'x', labels: [] } },
        fields,
      ),
    ).toEqual({ m: { text: null, labels: ['A', 'B'] } })
  })
})

describe('moveId', () => {
  it('swaps with a neighbour and returns null at the ends', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toBeNull()
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toBeNull()
    expect(moveId(['a', 'b'], 'zz', 1)).toBeNull()
  })
})

describe('loggableFields', () => {
  const fields = [field({ id: 'a', label: 'A' }), field({ id: 'h', label: 'H', hidden: true, sortOrder: 1 })]
  it('offers the visible fields, resolving a subtype to its parent', () => {
    expect(loggableFields(fields, rows, 'hill')!.map((f) => f.id)).toEqual(['a'])
  })
  it('is undefined when the activity has no fields at all, so the fixed form can stand in', () => {
    expect(loggableFields(fields, [{ id: 'other', parentId: null }], 'other')).toBeUndefined()
  })
  it('is empty — not undefined — when the user hid every field', () => {
    expect(loggableFields([field({ id: 'h', label: 'H', hidden: true })], rows, 'run')).toEqual([])
  })
})

describe('reading an entry back', () => {
  const fields = [
    field({ id: 'q', label: 'Quality', kind: 'multiselect', legacyKey: 'quality' }),
    field({ id: 'n', label: 'Gratitude', sortOrder: 1 }),
    field({ id: 'n2', label: 'Empty note', sortOrder: 2 }),
    field({ id: 'm', label: 'Mood', kind: 'multiselect', sortOrder: 3, hidden: true }),
    field({ id: 'm2', label: 'Old mood', kind: 'multiselect', sortOrder: 4, hidden: true }),
  ]
  it('detects whether anything was recorded', () => {
    expect(hasFieldValues(undefined)).toBe(false)
    expect(hasFieldValues({ n: { text: ' ', labels: [] } })).toBe(false)
    expect(hasFieldValues({ q: { text: null, labels: ['A'] } })).toBe(true)
  })
  it('shows visible multiple-select fields even when empty, notes only with text, hidden fields only with history', () => {
    const rows = recordedFields(fields, { n: { text: 'hi', labels: [] }, m2: { text: null, labels: ['Kept'] } })
    expect(rows.map((r) => [r.label, r.text, r.labels])).toEqual([
      ['Quality', null, []],
      ['Gratitude', 'hi', []],
      ['Old mood', null, ['Kept']],
    ])
  })
})
