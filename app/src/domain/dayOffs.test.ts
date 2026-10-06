import { describe, expect, it } from 'vitest'
import {
  DAY_OFF_REASON_MAX,
  dayOffWindowForMonth,
  mergeDayOffWindow,
  normalizeDayOffReason,
  type DayOff,
} from './dayOffs'

function dayOff(localDate: string, reason: string | null = null): DayOff {
  return { localDate, timeZone: 'Asia/Kolkata', reason, updatedAt: '2026-10-05T00:00:00.000Z' }
}

describe('normalizeDayOffReason', () => {
  it('turns blank, whitespace, null and undefined into null', () => {
    expect(normalizeDayOffReason('')).toBeNull()
    expect(normalizeDayOffReason('   \n')).toBeNull()
    expect(normalizeDayOffReason(null)).toBeNull()
    expect(normalizeDayOffReason(undefined)).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeDayOffReason('  Public holiday ')).toBe('Public holiday')
  })

  it('caps at the max length, counting characters not UTF-16 units', () => {
    expect(normalizeDayOffReason('a'.repeat(DAY_OFF_REASON_MAX + 20))).toHaveLength(DAY_OFF_REASON_MAX)
    const emoji = '🌴'.repeat(DAY_OFF_REASON_MAX + 1)
    expect(Array.from(normalizeDayOffReason(emoji) ?? '')).toHaveLength(DAY_OFF_REASON_MAX)
  })
})

describe('dayOffWindowForMonth', () => {
  it('covers the whole 6-week grid the picker shows', () => {
    // October 2026 starts on a Thursday — the grid starts Sun 27 Sep and runs 42 days.
    expect(dayOffWindowForMonth(new Date(2026, 9, 17))).toEqual({ from: '2026-09-27', to: '2026-11-07' })
  })
})

describe('mergeDayOffWindow', () => {
  const window = { from: '2026-10-01', to: '2026-10-31' }

  it('replaces days inside the window with the fresh list', () => {
    const cache = { '2026-10-02': dayOff('2026-10-02', 'old'), '2026-10-09': dayOff('2026-10-09') }
    const merged = mergeDayOffWindow(cache, window, [dayOff('2026-10-02', 'new')])
    expect(merged).toEqual({ '2026-10-02': dayOff('2026-10-02', 'new') })
  })

  it('keeps days outside the window untouched', () => {
    const cache = { '2026-09-30': dayOff('2026-09-30'), '2026-11-01': dayOff('2026-11-01') }
    expect(Object.keys(mergeDayOffWindow(cache, window, []))).toEqual(['2026-09-30', '2026-11-01'])
  })
})
