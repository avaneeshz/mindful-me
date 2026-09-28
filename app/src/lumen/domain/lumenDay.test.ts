import { describe, expect, it } from 'vitest'
import { computeCandidateSchedule, generateId, validateSchedule } from '@/domain/scheduling'
import type { ScheduledActivity } from '@/domain/types'
import {
  addDaysISO,
  axisClock,
  axisFromClock,
  axisToStorage,
  daysBetweenISO,
  durationToClock,
  isInLumenDay,
  LUMEN_AXIS_BOUNDS,
  LUMEN_DAY_END,
  LUMEN_DAY_START,
  loggedMinutes,
  lumenDayDates,
  lumenDayOf,
  minutesByKey,
  nowOnAxis,
  schedulingList,
  storageToAxis,
  stripPieces,
  toAxis,
} from './lumenDay'

function make(name: string, startMinutes: number, durationMinutes: number): ScheduledActivity {
  return {
    id: generateId(),
    name,
    path: [],
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    fieldSelections: {},
    dreamsNote: null,
    status: 'planned',
    timezone: 'UTC',
  }
}

describe('Lumen day dates', () => {
  it('shifts calendar dates across month and year ends', () => {
    expect(addDaysISO('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
    expect(daysBetweenISO('2026-09-12', '2026-09-13')).toBe(1)
    expect(daysBetweenISO('2026-09-12', '2026-09-11')).toBe(-1)
  })

  it('counts 00:00–05:59 as the evening before', () => {
    expect(lumenDayOf(new Date(2026, 8, 13, 1, 30))).toBe('2026-09-12')
    expect(lumenDayOf(new Date(2026, 8, 13, 5, 59))).toBe('2026-09-12')
    expect(lumenDayOf(new Date(2026, 8, 13, 6, 0))).toBe('2026-09-13')
    expect(lumenDayOf(new Date(2026, 8, 13, 23, 59))).toBe('2026-09-13')
  })

  it('loads the day before, the day, and the day after', () => {
    expect(lumenDayDates('2026-09-12')).toEqual({ prev: '2026-09-11', day: '2026-09-12', next: '2026-09-13' })
  })
})

describe('the axis (the 12th: 6 AM on the 12th → 6 AM on the 13th)', () => {
  const day = '2026-09-12'

  it('maps storage to the axis and back, keeping after-midnight entries on the next date', () => {
    expect(axisToStorage(day, 21 * 60)).toEqual({ date: '2026-09-12', startMinutes: 1260 })
    // 01:30 in the 12th's Night strip is stored on the 13th.
    expect(axisToStorage(day, 1440 + 90)).toEqual({ date: '2026-09-13', startMinutes: 90 })
    expect(axisToStorage(day, -60)).toEqual({ date: '2026-09-11', startMinutes: 1380 })
    expect(storageToAxis(day, '2026-09-13', 90)).toBe(1530)
    expect(storageToAxis(day, '2026-09-11', 1380)).toBe(-60)
  })

  it('places now on the axis', () => {
    expect(nowOnAxis(day, new Date(2026, 8, 13, 1, 30))).toBe(1530)
    expect(isInLumenDay(1530)).toBe(true)
    expect(isInLumenDay(LUMEN_DAY_END)).toBe(false)
    expect(isInLumenDay(LUMEN_DAY_START)).toBe(true)
  })

  it('draws each strip from all three dates and clips midnight-crossers', () => {
    const lastNightSleep = make('Sleep', 23 * 60, 8 * 60) // 11th 23:00 → 12th 07:00
    const lunch = make('Lunch', 13 * 60, 45) // 12th 13:00
    const lateShow = make('Film', 23 * 60, 120) // 12th 23:00 → 13th 01:00, stored on the 12th
    const earlyRead = make('Reading', 2 * 60, 30) // 13th 02:00, stored on the 13th
    const tomorrowRun = make('Run', 7 * 60, 30) // 13th 07:00 — the 13th's own Lumen day
    const axis = toAxis(day, {
      '2026-09-11': [lastNightSleep],
      '2026-09-12': [lunch, lateShow],
      '2026-09-13': [earlyRead, tomorrowRun],
    })

    expect(stripPieces(axis, 'day').map((p) => [p.activity.name, p.start, p.end, p.continuesBefore])).toEqual([
      ['Sleep', 360, 420, true], // only its 06:00–07:00 tail is in the 12th's day
      ['Lunch', 780, 825, false],
    ])
    expect(stripPieces(axis, 'night').map((p) => [p.activity.name, p.start, p.end])).toEqual([
      ['Film', 1380, 1500],
      ['Reading', 1560, 1590],
    ])
    // Tomorrow's run starts after 06:00 on the 13th, so it is not part of the 12th.
    expect(loggedMinutes(axis)).toBe(60 + 45 + 120 + 30)
    expect(Object.fromEntries(minutesByKey(axis, (a) => a.name ?? ''))).toEqual({
      Sleep: 60,
      Lunch: 45,
      Film: 120,
      Reading: 30,
    })
  })

  it('ignores zero-length legacy markers', () => {
    expect(toAxis(day, { '2026-09-12': [make('Flag', 600, 0)] })).toEqual([])
  })

  it('schedules across midnight with the shared scheduling rules', () => {
    const tomorrowRun = make('Run', 7 * 60, 30) // 13th 07:00 → axis 1860
    const axis = toAxis(day, { '2026-09-13': [tomorrowRun] })
    const list = schedulingList(axis)
    // A 9-hour sleep from 22:30 on the 12th only fits until the 07:00 run.
    const candidate = computeCandidateSchedule({ name: 'Sleep', path: [] }, 22 * 60 + 30, list, {
      requestedDuration: 9 * 60,
      bounds: LUMEN_AXIS_BOUNDS,
    })
    expect(candidate).toMatchObject({ startMinutes: 1350, durationMinutes: 510 })
    expect(validateSchedule(candidate, list, LUMEN_AXIS_BOUNDS)).toEqual({ ok: true })
    // Stored as ONE row on the 12th, running past midnight (rule 2).
    expect(axisToStorage(day, candidate.startMinutes)).toEqual({ date: '2026-09-12', startMinutes: 1350 })
  })

  it('formats axis minutes as a wall clock', () => {
    expect(axisClock(1530)).toBe('01:30')
    expect(axisClock(-60)).toBe('23:00')
    expect(axisClock(360)).toBe('06:00')
  })
})

describe('typed times on the Lumen day', () => {
  it('reads 12–6 AM as the night after', () => {
    expect(axisFromClock(21 * 60)).toBe(1260)
    expect(axisFromClock(90)).toBe(1530)
    expect(axisFromClock(360)).toBe(360)
  })

  it('reads an end before the start as the next morning', () => {
    expect(durationToClock(23 * 60, 7 * 60)).toBe(480)
    expect(durationToClock(1530, 150)).toBe(60) // 01:30 → 02:30
    expect(durationToClock(600, 645)).toBe(45)
    expect(durationToClock(600, 600)).toBe(1440)
  })
})
