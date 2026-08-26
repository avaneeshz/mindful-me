import { describe, expect, it } from 'vitest'
import { dateFromLocalMinutes, localDateISO, localDayRange, localMinutesOf } from './localTime'

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
