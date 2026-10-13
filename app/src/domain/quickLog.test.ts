import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  canSubmitDatedQuickLog,
  dateTimeSpanMinutes,
  daysBetweenISO,
  defaultEndDate,
  formatMinutesLabel,
  totalMinutesFor,
} from './quickLog'

describe('totalMinutesFor', () => {
  it('sums only entries with the given name', () => {
    const board = [
      { name: 'Sun Exposure', durationMinutes: 28 },
      { name: 'Moon Exposure', durationMinutes: 10 },
      { name: 'Sun Exposure', durationMinutes: 52 },
      { name: null, durationMinutes: 30 },
    ]
    expect(totalMinutesFor(board, 'Sun Exposure')).toBe(80)
    expect(totalMinutesFor(board, 'Moon Exposure')).toBe(10)
  })

  it('is zero for an empty board', () => {
    expect(totalMinutesFor([], 'Sun Exposure')).toBe(0)
  })
})

describe('formatMinutesLabel', () => {
  it('always uses plain minutes, even past an hour', () => {
    expect(formatMinutesLabel(28)).toBe('28m')
    expect(formatMinutesLabel(80)).toBe('80m')
    expect(formatMinutesLabel(600)).toBe('600m')
  })

  it('is empty when nothing is logged', () => {
    expect(formatMinutesLabel(0)).toBe('')
  })
})

describe('dated quick-log range', () => {
  it('does calendar-day arithmetic across month and year ends', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
    expect(daysBetweenISO('2026-10-11', '2026-10-12')).toBe(1)
    expect(daysBetweenISO('2026-10-12', '2026-10-11')).toBe(-1)
    expect(daysBetweenISO('2026-02-30', '2026-03-01')).toBeNull()
  })

  it('defaults End to the next day when its clock time is at or before Start', () => {
    expect(defaultEndDate('2026-10-11', '22:00', '06:00')).toBe('2026-10-12')
    expect(defaultEndDate('2026-10-11', '09:00', '09:00')).toBe('2026-10-12')
    expect(defaultEndDate('2026-10-11', '09:00', '10:30')).toBe('2026-10-11')
    expect(defaultEndDate('2026-10-11', '09:00', '')).toBe('2026-10-11')
  })

  it('measures an overnight span across two dates', () => {
    expect(dateTimeSpanMinutes('2026-10-11', '22:00', '2026-10-12', '06:00')).toBe(8 * 60)
  })

  it('reports a negative span when End is before Start, and rejects it', () => {
    expect(dateTimeSpanMinutes('2026-10-12', '08:00', '2026-10-12', '07:00')).toBe(-60)
    expect(canSubmitDatedQuickLog('2026-10-12', '08:00', '2026-10-12', '07:00')).toBe(false)
  })

  it('accepts up to 24h and rejects longer or malformed ranges', () => {
    expect(canSubmitDatedQuickLog('2026-10-11', '22:00', '2026-10-12', '22:00')).toBe(true)
    expect(canSubmitDatedQuickLog('2026-10-11', '22:00', '2026-10-12', '22:01')).toBe(false)
    expect(canSubmitDatedQuickLog('2026-10-11', '', '2026-10-12', '06:00')).toBe(false)
  })
})
