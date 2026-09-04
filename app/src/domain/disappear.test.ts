import { describe, expect, it } from 'vitest'
import { isCardLocked, isTileLocked, tileProgress, timesScheduledToday } from './disappear'
import type { ActivityCard, ActivityList, ScheduledActivity } from './types'

let id = 0
function activity(name: string | null, overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
  id += 1
  return {
    id: `a${id}`,
    name,
    path: [],
    startMinutes: 0,
    durationMinutes: 30,
    flags: [],
    quality: null, symptoms: [], notes: null,
    status: 'planned',
    timezone: 'UTC',
    ...overrides,
  }
}

const AUTO_ONE: ActivityCard = {
  name: 'Night Sleep',
  categoryId: 'sleep',
  icon: (() => null) as unknown as ActivityCard['icon'],
  color: '#000',
  onColor: 'text-white',
  disappear: { mode: 'auto', limit: 1 },
}

const AUTO_TWO: ActivityCard = { ...AUTO_ONE, name: 'Bed Exercise', disappear: { mode: 'auto', limit: 2 } }
const MANUAL: ActivityCard = { ...AUTO_ONE, name: 'Slow down', disappear: { mode: 'manual' } }

const NO_DISMISSED: ReadonlySet<string> = new Set()

describe('timesScheduledToday', () => {
  it('is 0 for a name with no matching activity', () => {
    expect(timesScheduledToday([], 'Night Sleep')).toBe(0)
  })

  it('counts every activity sharing the exact name, regardless of time or duration', () => {
    const activities: ActivityList = [
      activity('Night Sleep', { startMinutes: 0, durationMinutes: 480 }),
      activity('Night Sleep', { startMinutes: 600, durationMinutes: 15 }),
      activity('Day Sleep'),
    ]
    expect(timesScheduledToday(activities, 'Night Sleep')).toBe(2)
  })

  it('never counts a flag marker (name: null) toward any card', () => {
    const activities: ActivityList = [activity(null, { durationMinutes: 0, flags: ['Fear response'] })]
    expect(timesScheduledToday(activities, 'Night Sleep')).toBe(0)
  })
})

describe('isCardLocked — auto:N', () => {
  it('is unlocked below the threshold', () => {
    expect(isCardLocked(AUTO_TWO, [activity('Bed Exercise')], NO_DISMISSED)).toBe(false)
    expect(isCardLocked(AUTO_ONE, [activity('Day Sleep')], NO_DISMISSED)).toBe(false) // a different card's use
  })

  it('locks the exact instant the count reaches the limit — never one early', () => {
    expect(isCardLocked(AUTO_ONE, [activity('Night Sleep')], NO_DISMISSED)).toBe(true)
    expect(isCardLocked(AUTO_TWO, [activity('Bed Exercise')], NO_DISMISSED)).toBe(false)
    expect(isCardLocked(AUTO_TWO, [activity('Bed Exercise'), activity('Bed Exercise')], NO_DISMISSED)).toBe(true)
  })

  it('stays locked past the limit, never un-locks from extra uses', () => {
    const activities: ActivityList = [activity('Night Sleep'), activity('Night Sleep'), activity('Night Sleep')]
    expect(isCardLocked(AUTO_ONE, activities, NO_DISMISSED)).toBe(true)
  })

  it('an auto card is never affected by the dismissed set', () => {
    expect(isCardLocked(AUTO_ONE, [], new Set(['Night Sleep']))).toBe(false)
  })
})

describe('isCardLocked — manual', () => {
  it('is unlocked until explicitly dismissed, no matter how many times it was scheduled', () => {
    const activities: ActivityList = [activity('Slow down'), activity('Slow down'), activity('Slow down')]
    expect(isCardLocked(MANUAL, activities, NO_DISMISSED)).toBe(false)
  })

  it('locks once its name is in the dismissed set, even with zero uses today', () => {
    expect(isCardLocked(MANUAL, [], new Set(['Slow down']))).toBe(true)
  })

  it('only responds to its own exact name in the dismissed set', () => {
    expect(isCardLocked(MANUAL, [], new Set(['Bed Exercise']))).toBe(false)
  })
})

describe('tileProgress', () => {
  const cards = [AUTO_ONE, AUTO_TWO, MANUAL]

  it('is 0 of N when nothing is locked', () => {
    expect(tileProgress(cards, [], NO_DISMISSED)).toEqual({ done: 0, total: 3 })
  })

  it('counts a mix of auto-locked and manually-dismissed items', () => {
    const activities: ActivityList = [activity('Night Sleep')] // locks AUTO_ONE only
    const dismissed = new Set(['Slow down']) // locks MANUAL only
    expect(tileProgress(cards, activities, dismissed)).toEqual({ done: 2, total: 3 })
  })

  it('is N of N once every item in the tile is locked', () => {
    const activities: ActivityList = [
      activity('Night Sleep'),
      activity('Bed Exercise'),
      activity('Bed Exercise'),
    ]
    const dismissed = new Set(['Slow down'])
    expect(tileProgress(cards, activities, dismissed)).toEqual({ done: 3, total: 3 })
  })

  it('total is 0 for an empty tile (no cards)', () => {
    expect(tileProgress([], [], NO_DISMISSED)).toEqual({ done: 0, total: 0 })
  })
})

describe('isTileLocked', () => {
  it('is false while any item remains unlocked', () => {
    expect(isTileLocked({ done: 2, total: 3 })).toBe(false)
  })

  it('is true only once done equals total, and total is non-zero', () => {
    expect(isTileLocked({ done: 3, total: 3 })).toBe(true)
    expect(isTileLocked({ done: 0, total: 0 })).toBe(false) // an empty tile is never "locked"
  })
})
