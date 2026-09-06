import { describe, expect, it } from 'vitest'
import {
  dateFromLocalMinutes,
  isSameLocalDay,
  localDateISO,
  localDayRange,
  localMinutesOf,
  shouldRolloverViewedDate,
} from './localTime'

describe('dateFromLocalMinutes', () => {
  it('anchors the given minutes to the reference date, in local time', () => {
    const reference = new Date(2026, 7, 25, 16, 0)
    const result = dateFromLocalMinutes(reference, 10 * 60 + 30) // 10:30
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(7)
    expect(result.getDate()).toBe(25)
    expect(result.getHours()).toBe(10)
    expect(result.getMinutes()).toBe(30)
  })

  it('rolls over into the next calendar day for minutes past 1440 (rule 2)', () => {
    const reference = new Date(2026, 7, 25, 0, 0)
    const result = dateFromLocalMinutes(reference, 25 * 60) // 01:00 the next day
    expect(result.getDate()).toBe(26)
    expect(result.getHours()).toBe(1)
  })

  it('round-trips with localMinutesOf for an ordinary same-day time', () => {
    const reference = new Date(2026, 7, 25, 0, 0)
    for (const minutes of [0, 15, 600, 959, 1439]) {
      const date = dateFromLocalMinutes(reference, minutes)
      expect(localMinutesOf(date)).toBe(minutes)
    }
  })
})

describe('localDateISO', () => {
  it('formats the local calendar day, zero-padded', () => {
    expect(localDateISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localDateISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('localDayRange', () => {
  it('spans exactly 24 hours, from local midnight to the next local midnight', () => {
    const { start, end } = localDayRange(new Date(2026, 7, 25, 16, 30))
    expect(start.getHours()).toBe(0)
    expect(start.getDate()).toBe(25)
    expect(end.getDate()).toBe(26)
    expect(end.getHours()).toBe(0)
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe('isSameLocalDay', () => {
  it('is true for two instants on the same calendar day, any time of day', () => {
    expect(isSameLocalDay(new Date(2026, 7, 25, 0, 1), new Date(2026, 7, 25, 23, 59))).toBe(true)
  })

  it('is true for the exact same instant', () => {
    const date = new Date(2026, 7, 25, 12, 0)
    expect(isSameLocalDay(date, date)).toBe(true)
  })

  it('is false across a day boundary, even one minute apart', () => {
    expect(isSameLocalDay(new Date(2026, 7, 25, 23, 59), new Date(2026, 7, 26, 0, 0))).toBe(false)
  })

  it('is false for the same day-of-month in a different month or year', () => {
    expect(isSameLocalDay(new Date(2026, 7, 25), new Date(2026, 8, 25))).toBe(false)
    expect(isSameLocalDay(new Date(2026, 7, 25), new Date(2027, 7, 25))).toBe(false)
  })
})

/**
 * The bug this guards: `BoardContext`'s `viewedDate` used to be set once at
 * mount and only ever changed by an explicit date-picker call — nothing
 * watched the live device clock, so a tab left open (backgrounded, not
 * reloaded) across local midnight kept showing/writing yesterday's board
 * forever. These are exhaustive edge cases for the pure decision behind the
 * fix; the React wiring itself (`BoardContext.tsx`'s rollover effect) has no
 * dedicated test — this suite has no DOM/hook-rendering environment (see
 * `App.smoke.test.tsx`'s `renderToStaticMarkup`-only pattern, which never
 * runs effects) — so the one real branch point is covered here instead.
 */
describe('shouldRolloverViewedDate', () => {
  const day1Morning = new Date(2026, 7, 25, 9, 0)
  const day1LateNight = new Date(2026, 7, 25, 23, 59)
  const day2Midnight = new Date(2026, 7, 26, 0, 0)
  const day2Morning = new Date(2026, 7, 26, 9, 0)

  it('is false when the clock tick has not crossed a calendar day at all', () => {
    // Following today, but this tick is still the same day — nothing to do.
    expect(shouldRolloverViewedDate(day1Morning, day1Morning, day1LateNight)).toBe(false)
  })

  it('is true the instant the device clock crosses local midnight while following today', () => {
    // viewedDate matched `prevNow`'s day (Day 1) — the board WAS following
    // today right up to this tick — and `now` has moved to Day 2.
    expect(shouldRolloverViewedDate(day1LateNight, day1LateNight, day2Midnight)).toBe(true)
  })

  it('is true even for the exact same instant used as both viewedDate and prevNow', () => {
    expect(shouldRolloverViewedDate(day1Morning, day1LateNight, day2Morning)).toBe(true)
  })

  it('is false when viewedDate is pinned to a day other than the one the clock just left (rule 12)', () => {
    // The user deliberately navigated to some other day (here, Day 1's
    // morning is irrelevant — viewedDate is pinned to a THIRD day) before
    // this real midnight crossing elsewhere. A real clock rollover must
    // never yank that navigation back to "today".
    const pinnedToADifferentDay = new Date(2026, 7, 1, 12, 0)
    expect(shouldRolloverViewedDate(pinnedToADifferentDay, day1LateNight, day2Midnight)).toBe(false)
  })

  it('is false when viewedDate is pinned to a future day past the day that just started', () => {
    const pinnedToTomorrow = new Date(2026, 7, 27, 0, 0)
    expect(shouldRolloverViewedDate(pinnedToTomorrow, day1LateNight, day2Midnight)).toBe(false)
  })

  it('still rolls over correctly after the app was suspended across more than one midnight', () => {
    // The tab was following today (Day 1) when it was last checked, then the
    // device slept for several days — `now` has jumped straight to Day 5.
    // The board should catch up to Day 5, not get stuck one day forward.
    const daysLater = new Date(2026, 7, 29, 8, 0)
    expect(shouldRolloverViewedDate(day1Morning, day1Morning, daysLater)).toBe(true)
  })

  it('is false immediately after a rollover already caught up (no further crossing this tick)', () => {
    // Once `viewedDate` has been advanced to Day 2, the next same-day tick
    // must not re-trigger.
    expect(shouldRolloverViewedDate(day2Midnight, day2Midnight, day2Morning)).toBe(false)
  })
})
