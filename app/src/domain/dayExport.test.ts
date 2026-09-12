import { describe, expect, it } from 'vitest'
import { assembleDayExport } from './dayExport'
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
    status: 'planned',
    timezone: 'UTC',
    ...overrides,
  }
}

function note(overrides: Partial<NoteEntry> = {}): NoteEntry {
  return {
    id: 'n1',
    buttonKey: 'prayer',
    note: 'Grateful for today.',
    entryType: null,
    createdAt: '2026-09-11T10:00:00.000Z',
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
    expect(result.noteEntries[0].buttonLabel).toBe('Prayer')
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
})
