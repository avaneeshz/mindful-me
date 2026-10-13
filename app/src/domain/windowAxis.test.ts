import { describe, expect, it } from 'vitest'
import { commitSchedule } from './scheduling'
import {
  mergeWindowIntoDay,
  minutesWithinWindow,
  overlapsWindow,
  placeClockInWindow,
  splitByOwnerDay,
  startDateForClock,
  toAxis,
  toOwnDay,
  windowBoundsFor,
  windowFromDays,
} from './windowAxis'

function act(name: string, startMinutes: number, durationMinutes: number) {
  return commitSchedule({ id: null, activity: { name, path: [] }, startMinutes, durationMinutes })
}

// Sleep from 12 Oct 21:42 to 13 Oct 10:00 — stored once, on the 12th.
const sleep = act('Sleep', 21 * 60 + 42, 738)

describe('the page window', () => {
  it('on the 12th shows the evening part and the 13th\'s early morning, but not the 13th\'s 06:00 onward', () => {
    const page12 = windowFromDays({ 0: [sleep] })
    expect(page12).toHaveLength(1)
    expect(page12[0].startMinutes).toBe(21 * 60 + 42)
    expect(minutesWithinWindow(page12[0])).toBe(1800 - (21 * 60 + 42)) // 21:42 -> 06:00 the next morning
  })

  it('on the 13th shows only 06:00-10:00 of it, placed by its own day — never at 21:42 again', () => {
    const page13 = windowFromDays({ [-1]: [sleep] })
    expect(page13).toHaveLength(1)
    expect(page13[0].id).toBe(sleep.id)
    expect(page13[0].startMinutes).toBe(21 * 60 + 42 - 1440)
    expect(minutesWithinWindow(page13[0])).toBe(240) // 06:00 -> 10:00
  })

  it('shows the next day\'s 00:00-06:00 activities on this page, and hides the rest of them', () => {
    const early = act('Meditation', 2 * 60, 30)
    const late = act('Walk', 9 * 60, 30)
    const page = windowFromDays({ 1: [early, late] })
    expect(page.map((a) => a.name)).toEqual(['Meditation'])
    expect(page[0].startMinutes).toBe(1440 + 120)
  })

  it('hides the day\'s own 00:00-06:00 — that is the previous page\'s night tail', () => {
    expect(windowFromDays({ 0: [act('Early', 120, 30), act('Midday', 720, 30)] }).map((a) => a.name)).toEqual(['Midday'])
  })

  it('treats a flag marker as inside only when its own instant is', () => {
    expect(overlapsWindow({ startMinutes: 360, durationMinutes: 0 })).toBe(true)
    expect(overlapsWindow({ startMinutes: 359, durationMinutes: 0 })).toBe(false)
    expect(overlapsWindow({ startMinutes: 1800, durationMinutes: 0 })).toBe(false)
  })
})

describe('ownership and storage', () => {
  it('files an activity under the day that started it, in that day\'s own minutes', () => {
    const onPage13 = toAxis(sleep, -1)
    const { offset, activity } = toOwnDay(onPage13)
    expect(offset).toBe(-1)
    expect(activity.startMinutes).toBe(sleep.startMinutes)
  })

  it('splits a page\'s list by owner day', () => {
    const early = act('Meditation', 2 * 60, 30)
    const split = splitByOwnerDay([toAxis(sleep, -1), act('Lunch', 720, 30), toAxis(early, 1)])
    expect([...split.keys()].sort()).toEqual([-1, 0, 1])
    expect(split.get(1)?.[0].startMinutes).toBe(120)
  })

  it('keeps what the page never loaded, and replaces what it did', () => {
    const morning = act('Early run', 5 * 60, 30) // the 12th's 05:00 — outside the 13th page's window
    const evening = act('Dinner', 20 * 60, 60) // the 12th's 20:00 — outside the 13th page's window too
    const stored = [morning, evening, sleep] // the 12th's stored list, as seen from the 13th page (offset -1)
    // The user shortened Sleep from the 13th page (it's now 21:42 -> 09:00).
    const edited = { ...sleep, durationMinutes: 678 }
    const next = mergeWindowIntoDay(stored, -1, [edited])
    expect(next.map((a) => a.name).sort()).toEqual(['Dinner', 'Early run', 'Sleep'])
    expect(next.find((a) => a.name === 'Sleep')?.durationMinutes).toBe(678)
  })

  it('drops an in-window activity that was deleted from the page', () => {
    expect(mergeWindowIntoDay([sleep], -1, [])).toEqual([])
  })
})

describe('editing across window edges', () => {
  it('widens the bounds to contain an activity that already runs past them', () => {
    const onPage13 = toAxis(sleep, -1)
    expect(windowBoundsFor(onPage13)).toEqual({ floor: onPage13.startMinutes, horizon: 1800 })
    expect(windowBoundsFor(null)).toEqual({ floor: 360, horizon: 1800 })
  })
})

describe('clock times typed without a date', () => {
  it('00:00-05:59 means the next morning on this page', () => {
    expect(placeClockInWindow(120)).toBe(1560)
    expect(placeClockInWindow(360)).toBe(360)
    expect(startDateForClock('2026-10-12', 120)).toBe('2026-10-13')
    expect(startDateForClock('2026-10-12', 600)).toBe('2026-10-12')
  })
})
