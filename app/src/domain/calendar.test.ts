import { describe, expect, it } from 'vitest'
import { addMonths, buildMonthGrid, daysInMonth, startOfMonth } from './calendar'

describe('startOfMonth', () => {
  it('returns the 1st of the same month/year regardless of the day given', () => {
    for (const day of [1, 15, 28, 31]) {
      const result = startOfMonth(new Date(2026, 0, day))
      expect(result.getFullYear()).toBe(2026)
      expect(result.getMonth()).toBe(0)
      expect(result.getDate()).toBe(1)
    }
  })
})

describe('addMonths', () => {
  it('shifts forward within a year', () => {
    const result = addMonths(new Date(2026, 2, 15), 2)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(4)
  })

  it('rolls the year forward across December', () => {
    const result = addMonths(new Date(2026, 11, 15), 1)
    expect(result.getFullYear()).toBe(2027)
    expect(result.getMonth()).toBe(0)
  })

  it('rolls the year backward across January', () => {
    const result = addMonths(new Date(2026, 0, 15), -1)
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(11)
  })

  it('always lands on the 1st, independent of the input day', () => {
    expect(addMonths(new Date(2026, 0, 31), 1).getDate()).toBe(1)
  })
})

describe('daysInMonth', () => {
  it('returns 31 for a 31-day month', () => {
    expect(daysInMonth(new Date(2026, 7, 1))).toBe(31) // August
  })

  it('returns 30 for a 30-day month', () => {
    expect(daysInMonth(new Date(2026, 8, 1))).toBe(30) // September
  })

  it('handles February in a leap year vs. a common year', () => {
    expect(daysInMonth(new Date(2024, 1, 1))).toBe(29) // 2024 is a leap year
    expect(daysInMonth(new Date(2026, 1, 1))).toBe(28)
  })
})

describe('buildMonthGrid', () => {
  it('is always exactly 42 days (6 full weeks)', () => {
    // August 2026 (30 days, starts on a Saturday) and February 2026 (28
    // days, starts on a Sunday) are deliberately different shapes.
    expect(buildMonthGrid(startOfMonth(new Date(2026, 7, 1)))).toHaveLength(42)
    expect(buildMonthGrid(startOfMonth(new Date(2026, 1, 1)))).toHaveLength(42)
  })

  it('always starts on a Sunday and ends on a Saturday', () => {
    const grid = buildMonthGrid(startOfMonth(new Date(2026, 7, 1)))
    expect(grid[0].getDay()).toBe(0)
    expect(grid[41].getDay()).toBe(6)
  })

  it('is contiguous — each cell is exactly one day after the previous', () => {
    const grid = buildMonthGrid(startOfMonth(new Date(2026, 7, 1)))
    for (let i = 1; i < grid.length; i += 1) {
      const diff = grid[i].getTime() - grid[i - 1].getTime()
      expect(diff).toBe(24 * 60 * 60 * 1000)
    }
  })

  it('contains every day of the target month exactly once', () => {
    const monthStart = startOfMonth(new Date(2026, 7, 1)) // August 2026, 31 days
    const grid = buildMonthGrid(monthStart)
    const inMonth = grid.filter((d) => d.getMonth() === 7 && d.getFullYear() === 2026)
    expect(inMonth).toHaveLength(31)
    expect(inMonth[0].getDate()).toBe(1)
    expect(inMonth[30].getDate()).toBe(31)
  })

  it('when the month starts on a Sunday, the grid begins exactly on the 1st (no leading padding)', () => {
    // February 2026 starts on a Sunday.
    const monthStart = startOfMonth(new Date(2026, 1, 1))
    const grid = buildMonthGrid(monthStart)
    expect(grid[0].getTime()).toBe(monthStart.getTime())
  })

  it('pads the trailing 6th row with next-month days when the month itself needs fewer than 6 rows', () => {
    const monthStart = startOfMonth(new Date(2026, 1, 1)) // Feb 2026: 28 days, starts Sunday -> exactly 4 rows
    const grid = buildMonthGrid(monthStart)
    const last = grid[41]
    expect(last.getMonth()).not.toBe(1)
  })
})
