import { describe, expect, it } from 'vitest'
import { assembleDayExport } from './dayExport'
import type { ActivityField } from './activityFields'
import type { NoteEntry } from './notes'
import type { ActivityList, ScheduledActivity } from './types'

let id = 0
function activity(overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
  id += 1
  return {
    id: `a${id}`,
    name: 'Reading',
    path: [],
    startMinutes: 9 * 60,
    durationMinutes: 30,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    fieldSelections: {},
    dreamsNote: null,
    status: 'planned',
    timezone: 'UTC',
    ...overrides,
  }
}

function note(overrides: Partial<NoteEntry> = {}): NoteEntry {
  return {
    id: 'n1',
    buttonKey: 'mirror',
    note: 'Grateful for today.',
    entryTypes: [],
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    ...overrides,
  }
}

const reflectionCardTitle = (card: number) => `Card ${card}`
const viewedDate = new Date(2026, 8, 11) // 11 Sep 2026, local

describe('assembleDayExport', () => {
  it('produces a valid, empty-but-not-error export for a day with nothing logged', () => {
    const result = assembleDayExport({
      viewedDate,
      activities: [],
      noteEntries: [],
      reflectionCardTitle,
    })

    expect(result.isoDate).toBe('2026-09-11')
    expect(result.activities).toEqual([])
    expect(result.noteEntries).toEqual([])
    expect(result.displayValues).toEqual([])
    expect(result.isEmpty).toBe(true)
    expect(result.dateLabel).toContain('2026')
  })

  it('includes activities, reflections and notes for the viewed day, in time order', () => {
    const activities: ActivityList = [
      activity({
        id: 'later',
        name: 'Walk',
        startMinutes: 18 * 60,
        durationMinutes: 45,
        quality: ['Flow'],
        symptoms: ['Dryness'],
        flags: ['Anger'],
        notes: 'Felt good.',
        reflections: [{ card: 3, note: 'System check-in.' }],
      }),
      activity({
        id: 'earlier',
        name: 'Meditation',
        path: ['Silent'],
        startMinutes: 6 * 60,
        durationMinutes: 20,
      }),
    ]
    const noteEntries: NoteEntry[] = [note({ id: 'n1', createdAt: '2026-09-11T15:00:00.000Z' })]

    const result = assembleDayExport({ viewedDate, activities, noteEntries, reflectionCardTitle })

    expect(result.activities.map((a) => a.id)).toEqual(['earlier', 'later'])
    expect(result.activities[1].pathLabel).toBeNull()
    expect(result.activities[0].pathLabel).toBe('Silent')
    expect(result.activities[1].quality).toEqual(['Flow'])
    expect(result.activities[1].symptoms).toEqual(['Dryness'])
    expect(result.activities[1].flag).toBe('Anger')
    expect(result.activities[1].notes).toBe('Felt good.')
    expect(result.activities[1].reflections).toEqual([{ card: 3, title: 'Card 3', note: 'System check-in.' }])
    expect(result.noteEntries).toHaveLength(1)
    expect(result.noteEntries[0].buttonLabel).toBe('Relational Nutrient')
    expect(result.isEmpty).toBe(false)
  })

  it('excludes a zero-duration flag-only marker from the activity list', () => {
    const activities: ActivityList = [activity({ name: null, durationMinutes: 0, flags: ['Triggered'] })]
    const result = assembleDayExport({ viewedDate, activities, noteEntries: [], reflectionCardTitle })
    expect(result.activities).toEqual([])
  })

  it('includes a midnight-crossing activity in FULL, attributed to the day it started on (rule 2)', () => {
    // Started 23:30, runs 90 minutes — ends 01:00 the next calendar day.
    // `BoardContext` stores this row under the day it started on and never
    // hands it to the next day's board (see this module's own doc comment),
    // so by the time it reaches `assembleDayExport` it simply belongs here —
    // in full, including the tail that plays out past midnight.
    const activities: ActivityList = [
      activity({ id: 'cross', startMinutes: 23 * 60 + 30, durationMinutes: 90 }),
    ]

    const result = assembleDayExport({ viewedDate, activities, noteEntries: [], reflectionCardTitle })
    expect(result.activities).toHaveLength(1)
    expect(result.activities[0].durationLabel).toBe('1h 30m')
  })

  it('computes a quick-log display value (Vipassana) from the given activities, not raw local storage', () => {
    const activities: ActivityList = [
      activity({ id: 'v1', name: 'Vipassana', startMinutes: 6 * 60, durationMinutes: 20 }),
      activity({ id: 'v2', name: 'Vipassana', startMinutes: 20 * 60, durationMinutes: 25 }),
    ]

    const result = assembleDayExport({
      viewedDate,
      activities,
      noteEntries: [],
      localDisplayValues: { steps: 4200 },
      reflectionCardTitle,
    })

    expect(result.displayValues).toEqual(
      expect.arrayContaining([
        { label: 'Vipassana', valueLabel: '45m' },
        { label: 'Steps', valueLabel: '4.2k' },
      ]),
    )
  })

  it('omits a display value entirely when it was never set ("if set")', () => {
    const result = assembleDayExport({
      viewedDate,
      activities: [],
      noteEntries: [],
      localDisplayValues: { steps: null },
      reflectionCardTitle,
    })
    expect(result.displayValues).toEqual([])
  })

  it('includes Protein (a synced day value, same local-first cache as Steps) formatted against its daily target', () => {
    const result = assembleDayExport({
      viewedDate,
      activities: [],
      noteEntries: [],
      localDisplayValues: { steps: 4200, protein: 45 },
      reflectionCardTitle,
    })

    expect(result.displayValues).toEqual(
      expect.arrayContaining([
        { label: 'Steps', valueLabel: '4.2k' },
        { label: 'Protein', valueLabel: '45/80' },
      ]),
    )
  })

  it('omits Protein when it was never set for the day, same as Steps ("if set")', () => {
    const result = assembleDayExport({
      viewedDate,
      activities: [],
      noteEntries: [],
      localDisplayValues: { steps: null, protein: null },
      reflectionCardTitle,
    })
    expect(result.displayValues).toEqual([])
  })
})

describe('assembleDayExport — the activity’s own notes and fields', () => {
  const fields: ActivityField[] = [
    { id: 'q', activityId: 'x', kind: 'multiselect', label: 'Activity quality', sortOrder: 0, hidden: false, legacyKey: 'quality', options: [] },
    { id: 'g', activityId: 'x', kind: 'text', label: 'Gratitude', sortOrder: 1, hidden: false, legacyKey: null, options: [] },
    { id: 'old', activityId: 'x', kind: 'multiselect', label: 'Retired field', sortOrder: 2, hidden: true, legacyKey: null, options: [] },
  ]
  const run = (a: ScheduledActivity, fieldsFor?: (a: ScheduledActivity) => readonly ActivityField[] | undefined) =>
    assembleDayExport({ viewedDate, activities: [a], noteEntries: [], reflectionCardTitle, fieldsForActivity: fieldsFor }).activities[0]!

  it('exports recorded fields under their own titles, keeping hidden ones that hold history', () => {
    const a = activity({
      fieldValues: {
        q: { text: null, labels: ['Flow', 'Calm'] },
        g: { text: 'sun', labels: [] },
        old: { text: null, labels: ['Kept'] },
      },
    })
    expect(run(a, () => fields).customFields).toEqual([
      { label: 'Activity quality', value: 'Flow, Calm' },
      { label: 'Gratitude', value: 'sun' },
      { label: 'Retired field', value: 'Kept' },
    ])
  })

  it('keeps the fixed layout for an older entry, or when the fields are unavailable', () => {
    expect(run(activity({ quality: ['Flow'] }), () => fields).customFields).toBeNull()
    expect(run(activity({ fieldValues: { g: { text: 'x', labels: [] } } })).customFields).toBeNull()
  })
})

describe('assembleDayExport — everything logged', () => {
  const base = { viewedDate: new Date(2026, 8, 11), noteEntries: [], reflectionCardTitle: () => 'Card' }

  it('exports the second text note and multiple-select choices recorded on an entry', () => {
    const data = assembleDayExport({
      ...base,
      activities: [
        activity({ name: 'Sleep', dreamsNote: 'Flying over water', fieldSelections: { f1: ['Deep Restorative'], f2: [] } }),
      ],
      noteFieldLabel: (fieldId) => (fieldId === 'f1' ? 'How was your sleep?' : undefined),
    })
    const entry = data.activities[0]!
    expect(entry.dreams).toBe('Flying over water')
    expect(entry.selections).toEqual([{ label: 'How was your sleep?', value: 'Deep Restorative' }])
  })

  it('leaves dreams and selections empty when none were recorded', () => {
    const data = assembleDayExport({ ...base, activities: [activity()] })
    expect(data.activities[0]!.dreams).toBeNull()
    expect(data.activities[0]!.selections).toEqual([])
  })

  it('includes a user-added daily number under its own label, and skips it when unset', () => {
    const numberButtons = [{ key: 'water', label: 'Water' }]
    const set = assembleDayExport({ ...base, activities: [], numberButtons, localDisplayValues: { water: 6 } })
    expect(set.displayValues.map((v) => v.label)).toEqual(['Water'])
    const unset = assembleDayExport({ ...base, activities: [], numberButtons, localDisplayValues: {} })
    expect(unset.displayValues).toEqual([])
  })

  it('exports a checklist touched that day with every item, and omits an untouched one', () => {
    const items = [{ key: 'a', label: 'Zinc' }, { key: 'b', label: 'Omega' }]
    const data = assembleDayExport({
      ...base,
      activities: [],
      checklists: [
        { label: 'Supplements', items, completions: [{ itemKey: 'a', localDate: '2026-09-11', done: true, note: ' with lunch ', completedAt: null }] },
        { label: 'Evening', items, completions: [] },
      ],
    })
    expect(data.checklists).toEqual([
      {
        label: 'Supplements',
        items: [
          { label: 'Zinc', done: true, note: 'with lunch' },
          { label: 'Omega', done: false, note: '' },
        ],
      },
    ])
    expect(data.isEmpty).toBe(false)
  })
})
