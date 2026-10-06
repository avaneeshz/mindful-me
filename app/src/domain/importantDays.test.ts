import { describe, expect, it } from 'vitest'
import { buildCalendarMarkers, importantDayDate, validateImportantDay } from './importantDays'

describe('importantDayDate', () => {
  it('repeats every year on the same month and day', () => {
    expect(importantDayDate({ month: 10, day: 6 }, 2026)).toBe('2026-10-06')
    expect(importantDayDate({ month: 10, day: 6 }, 2027)).toBe('2027-10-06')
  })
  it('moves Feb 29 to Feb 28 outside leap years', () => {
    expect(importantDayDate({ month: 2, day: 29 }, 2028)).toBe('2028-02-29')
    expect(importantDayDate({ month: 2, day: 29 }, 2026)).toBe('2026-02-28')
  })
})

describe('buildCalendarMarkers', () => {
  it('merges holidays and personal days, personal first', () => {
    const map = buildCalendarMarkers(
      [
        { date: '2026-11-08', name: 'Diwali' },
        { date: '2026-11-08', name: 'Another' },
      ],
      [{ id: 'p1', name: 'Mum’s birthday', month: 11, day: 8 }],
      [2026],
    )
    expect(map.get('2026-11-08')).toEqual([
      { kind: 'personal', name: 'Mum’s birthday', importantDayId: 'p1' },
      { kind: 'holiday', name: 'Another' },
      { kind: 'holiday', name: 'Diwali' },
    ])
  })
  it('places personal days in every requested year', () => {
    const map = buildCalendarMarkers([], [{ id: 'p', name: 'X', month: 1, day: 1 }], [2026, 2027])
    expect(map.has('2026-01-01')).toBe(true)
    expect(map.has('2027-01-01')).toBe(true)
  })
})

describe('validateImportantDay', () => {
  it('accepts a real date with a name', () => {
    expect(validateImportantDay({ name: 'Anniversary', month: 2, day: 29 })).toBeNull()
  })
  it('rejects blank names and impossible dates', () => {
    expect(validateImportantDay({ name: '  ', month: 1, day: 1 })).toBe('nameRequired')
    expect(validateImportantDay({ name: 'x'.repeat(81), month: 1, day: 1 })).toBe('nameTooLong')
    expect(validateImportantDay({ name: 'A', month: 2, day: 30 })).toBe('invalidDate')
    expect(validateImportantDay({ name: 'A', month: 4, day: 31 })).toBe('invalidDate')
    expect(validateImportantDay({ name: 'A', month: 13, day: 1 })).toBe('invalidDate')
  })
})
