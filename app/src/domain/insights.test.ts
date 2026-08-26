import { describe, expect, it } from 'vitest'
import {
  bucketByCalendarDay,
  bucketByCalendarWeek,
  CATEGORY_ORDER,
  formatDurationMinutes,
  sumDayTotals,
  type DayActivities,
} from './insights'
import { generateId, MINUTES_PER_DAY } from './scheduling'
import type { CategoryId, ScheduledActivity } from './types'

function make(
  startMinutes: number,
  durationMinutes: number,
  overrides: Partial<ScheduledActivity> = {},
): ScheduledActivity {
  return {
    id: overrides.id ?? generateId(),
    name: overrides.name ?? 'Homework',
    path: [],
    startMinutes,
    durationMinutes,
    flags: [],
    status: 'planned',
    timezone: 'UTC',
    ...overrides,
  }
}

/** Every activity in these tests is "Homework" (focus) unless named otherwise. */
function categoryOf(activity: ScheduledActivity): CategoryId {
  const table: Record<string, CategoryId> = {
    Homework: 'focus',
    'Night Sleep': 'mind',
    'Sports or Exercise': 'sports',
    'Body care': 'body',
    'Nature connect': 'nature',
  }
  return table[activity.name ?? ''] ?? 'focus'
}

function day(date: Date, activities: ScheduledActivity[]): DayActivities {
  return { date, activities }
}

const MON = new Date(2026, 7, 24) // a Monday, arbitrary anchor
const TUE = new Date(2026, 7, 25)
const WED = new Date(2026, 7, 26)

describe('bucketByCalendarDay — category grouping', () => {
  it('sums duration into the activity’s own category', () => {
    const [totals] = bucketByCalendarDay(
      [day(MON, [make(600, 60, { name: 'Homework' }), make(700, 30, { name: 'Night Sleep' })])],
      categoryOf,
    )
    expect(totals.minutesByCategory.focus).toBe(60)
    expect(totals.minutesByCategory.mind).toBe(30)
    expect(totals.occupiedMinutes).toBe(90)
  })

  it('every category is present, even at zero', () => {
    const [totals] = bucketByCalendarDay([day(MON, [])], categoryOf)
    for (const id of CATEGORY_ORDER) expect(totals.minutesByCategory[id]).toBe(0)
  })

  it('excludes flag markers (null name, zero duration) from every total', () => {
    const marker = make(600, 0, { name: null })
    const [totals] = bucketByCalendarDay([day(MON, [marker])], categoryOf)
    expect(totals.occupiedMinutes).toBe(0)
    expect(totals.completion.totalCount).toBe(0)
  })

  it('an empty day reports all-zero totals, not a crash', () => {
    const [totals] = bucketByCalendarDay([day(MON, [])], categoryOf)
    expect(totals.occupiedMinutes).toBe(0)
    expect(totals.completion).toEqual({
      totalCount: 0,
      completedCount: 0,
      totalMinutes: 0,
      completedMinutes: 0,
      completionRate: 0,
    })
  })
})

describe('bucketByCalendarDay — completion-rate math (planned vs. actual)', () => {
  it('counts completed vs. total, overall and per category', () => {
    const [totals] = bucketByCalendarDay(
      [
        day(MON, [
          make(600, 30, { name: 'Homework', status: 'completed' }),
          make(700, 30, { name: 'Homework', status: 'planned' }),
          make(800, 30, { name: 'Night Sleep', status: 'completed' }),
        ]),
      ],
      categoryOf,
    )
    expect(totals.completion).toMatchObject({ totalCount: 3, completedCount: 2 })
    expect(totals.completion.completionRate).toBeCloseTo(2 / 3)
    expect(totals.completionByCategory.focus).toMatchObject({ totalCount: 2, completedCount: 1 })
    expect(totals.completionByCategory.mind).toMatchObject({ totalCount: 1, completedCount: 1 })
  })

  it('completion rate is 0, never NaN, when nothing was planned', () => {
    const [totals] = bucketByCalendarDay([day(MON, [])], categoryOf)
    expect(totals.completion.completionRate).toBe(0)
    expect(Number.isNaN(totals.completion.completionRate)).toBe(false)
  })

  it('counts completedMinutes only for genuinely completed activities', () => {
    const [totals] = bucketByCalendarDay(
      [day(MON, [make(600, 45, { status: 'completed' }), make(700, 20, { status: 'planned' })])],
      categoryOf,
    )
    expect(totals.completion.totalMinutes).toBe(65)
    expect(totals.completion.completedMinutes).toBe(45)
  })
})

describe('bucketByCalendarDay — rule 2, midnight-crossing aggregation', () => {
  it('splits a crossing activity’s MINUTES across both days, counting it as ONE unit on its home day', () => {
    // 23:00 Monday for 90 minutes: 60 min left in Monday, 30 min into Tuesday.
    const crossing = make(1380, 90, { name: 'Night Sleep', status: 'completed' })
    const [mondayTotals, tuesdayTotals] = bucketByCalendarDay(
      [day(MON, [crossing]), day(TUE, [])],
      categoryOf,
    )

    expect(mondayTotals.minutesByCategory.mind).toBe(60)
    expect(tuesdayTotals.minutesByCategory.mind).toBe(30)
    expect(mondayTotals.occupiedMinutes + tuesdayTotals.occupiedMinutes).toBe(90)

    // Counted exactly once, under Monday (its home day) — Tuesday sees the
    // spillover minutes but does NOT double-count the activity itself.
    expect(mondayTotals.completion).toMatchObject({ totalCount: 1, completedCount: 1 })
    expect(tuesdayTotals.completion).toMatchObject({ totalCount: 0, completedCount: 0 })
  })

  it('a spillover landing on the very first row of `days` is attributed there when the caller supplies the leading day', () => {
    // Caller convention: include the day BEFORE the reported window so a
    // spillover from the night before still lands correctly (see the
    // function's own docstring). Sunday is the discarded leading day here.
    const SUN = new Date(2026, 7, 23)
    const crossing = make(1410, 60, { name: 'Night Sleep' }) // 23:30 Sun -> 00:30 Mon
    const [, mondayTotals] = bucketByCalendarDay([day(SUN, [crossing]), day(MON, [])], categoryOf)
    expect(mondayTotals.minutesByCategory.mind).toBe(30)
    expect(mondayTotals.occupiedMinutes).toBe(30)
    expect(mondayTotals.completion.totalCount).toBe(0) // counted under Sunday, not Monday
  })

  it('the first day in the list has no predecessor to inherit spillover from', () => {
    const [totals] = bucketByCalendarDay([day(MON, [])], categoryOf)
    expect(totals.occupiedMinutes).toBe(0)
  })

  it('an activity that does not cross midnight contributes only to its own day', () => {
    const [mondayTotals, tuesdayTotals] = bucketByCalendarDay(
      [day(MON, [make(600, 60)]), day(TUE, [])],
      categoryOf,
    )
    expect(mondayTotals.occupiedMinutes).toBe(60)
    expect(tuesdayTotals.occupiedMinutes).toBe(0)
  })
})

describe('sumDayTotals — daily/weekly totals and free/occupied math', () => {
  it('a single day sums to itself, with free/occupied against a 1440-minute window', () => {
    const [totals] = bucketByCalendarDay([day(MON, [make(600, 90)])], categoryOf)
    const range = sumDayTotals([totals])
    expect(range.occupiedMinutes).toBe(90)
    expect(range.totalMinutes).toBe(MINUTES_PER_DAY)
    expect(range.freeMinutes).toBe(MINUTES_PER_DAY - 90)
  })

  it('a week sums 7 days against a 7 x 1440-minute window', () => {
    const days = bucketByCalendarDay(
      [MON, TUE, WED].map((d) => day(d, [make(600, 60)])),
      categoryOf,
    )
    const range = sumDayTotals(days)
    expect(range.occupiedMinutes).toBe(180)
    expect(range.totalMinutes).toBe(3 * MINUTES_PER_DAY)
    expect(range.freeMinutes).toBe(3 * MINUTES_PER_DAY - 180)
  })

  it('free time never goes negative even in a pathological over-full window', () => {
    // Not reachable through real scheduling (rule 1 forbids overlap within a
    // day), but the fold itself must still be defensive.
    const days = bucketByCalendarDay([day(MON, [make(0, MINUTES_PER_DAY + 100)])], categoryOf)
    const range = sumDayTotals(days)
    expect(range.freeMinutes).toBe(0)
  })

  it('category totals and completion both fold additively across days', () => {
    const days = bucketByCalendarDay(
      [
        day(MON, [make(600, 30, { name: 'Homework', status: 'completed' })]),
        day(TUE, [make(600, 30, { name: 'Homework', status: 'planned' })]),
      ],
      categoryOf,
    )
    const range = sumDayTotals(days)
    expect(range.minutesByCategory.focus).toBe(60)
    expect(range.completion).toMatchObject({ totalCount: 2, completedCount: 1 })
    expect(range.completion.completionRate).toBeCloseTo(0.5)
    expect(range.completionByCategory.focus).toMatchObject({ totalCount: 2, completedCount: 1 })
  })

  it('an empty range (no days) is all-zero, not a crash', () => {
    const range = sumDayTotals([])
    expect(range.totalMinutes).toBe(0)
    expect(range.occupiedMinutes).toBe(0)
    expect(range.freeMinutes).toBe(0)
    expect(range.completion.completionRate).toBe(0)
  })
})

describe('bucketByCalendarWeek — trend bucketing', () => {
  it('groups exactly 7 consecutive days into one week row', () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2026, 7, 23 + i) // a Sunday-anchored week
      return day(d, [make(600, 30)])
    })
    const dayTotals = bucketByCalendarDay(days, categoryOf)
    const weeks = bucketByCalendarWeek(dayTotals)
    expect(weeks).toHaveLength(1)
    expect(weeks[0].weekStart).toEqual(new Date(2026, 7, 23))
    expect(weeks[0].occupiedMinutes).toBe(7 * 30)
  })

  it('drops a trailing partial week rather than reporting a short one', () => {
    const days = Array.from({ length: 10 }, (_, i) => day(new Date(2026, 7, 23 + i), []))
    const weeks = bucketByCalendarWeek(bucketByCalendarDay(days, categoryOf))
    expect(weeks).toHaveLength(1) // only the first full 7 of the 10 days
  })

  it('an input shorter than 7 days produces no week rows at all', () => {
    const days = Array.from({ length: 3 }, (_, i) => day(new Date(2026, 7, 23 + i), []))
    expect(bucketByCalendarWeek(bucketByCalendarDay(days, categoryOf))).toHaveLength(0)
  })

  it('multiple full weeks each fold their own 7 days independently', () => {
    const days = Array.from({ length: 14 }, (_, i) =>
      day(new Date(2026, 7, 23 + i), [make(600, 10)]),
    )
    const weeks = bucketByCalendarWeek(bucketByCalendarDay(days, categoryOf))
    expect(weeks).toHaveLength(2)
    expect(weeks[0].occupiedMinutes).toBe(70)
    expect(weeks[1].occupiedMinutes).toBe(70)
  })
})

describe('formatDurationMinutes', () => {
  it('formats a whole-hour value with no minutes remainder', () => {
    expect(formatDurationMinutes(60)).toBe('1h')
    expect(formatDurationMinutes(120)).toBe('2h')
  })

  it('formats a sub-hour value as minutes only', () => {
    expect(formatDurationMinutes(0)).toBe('0m')
    expect(formatDurationMinutes(45)).toBe('45m')
  })

  it('formats a mixed value as both', () => {
    expect(formatDurationMinutes(90)).toBe('1h 30m')
    expect(formatDurationMinutes(125)).toBe('2h 5m')
  })

  it('never goes negative and rounds to the nearest minute', () => {
    expect(formatDurationMinutes(-30)).toBe('0m')
    expect(formatDurationMinutes(59.6)).toBe('1h')
  })
})
