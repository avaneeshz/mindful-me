import { describe, expect, it } from 'vitest'
import {
  currentMeridiem,
  formatClockText,
  from24Hour,
  parseClockText,
  to24Hour,
} from './timeInput'

describe('currentMeridiem', () => {
  it('is AM before noon, PM from noon on', () => {
    expect(currentMeridiem(new Date(2026, 0, 1, 0, 0))).toBe('AM')
    expect(currentMeridiem(new Date(2026, 0, 1, 11, 59))).toBe('AM')
    expect(currentMeridiem(new Date(2026, 0, 1, 12, 0))).toBe('PM')
    expect(currentMeridiem(new Date(2026, 0, 1, 23, 30))).toBe('PM')
  })
})

describe('parseClockText', () => {
  it('reads a bare hour', () => {
    expect(parseClockText('9')).toEqual({ h12: 9, minute: 0 })
    expect(parseClockText('12')).toEqual({ h12: 12, minute: 0 })
  })

  it('reads colon-separated times', () => {
    expect(parseClockText('2:30')).toEqual({ h12: 2, minute: 30 })
    expect(parseClockText('12:05')).toEqual({ h12: 12, minute: 5 })
    expect(parseClockText('7:')).toEqual({ h12: 7, minute: 0 })
  })

  it('reads 3–4 digit runs as h + mm', () => {
    expect(parseClockText('230')).toEqual({ h12: 2, minute: 30 })
    expect(parseClockText('1215')).toEqual({ h12: 12, minute: 15 })
  })

  it('rejects out-of-range and junk', () => {
    expect(parseClockText('')).toBeNull()
    expect(parseClockText('0')).toBeNull()
    expect(parseClockText('13')).toBeNull()
    expect(parseClockText('2:60')).toBeNull()
    expect(parseClockText('99999')).toBeNull()
    expect(parseClockText('am')).toBeNull()
    expect(parseClockText('2:3:4')).toBeNull()
  })
})

describe('to24Hour / from24Hour round-trip', () => {
  it('maps the 12-hour edges correctly', () => {
    expect(to24Hour(12, 0, 'AM')).toBe('00:00')
    expect(to24Hour(12, 30, 'PM')).toBe('12:30')
    expect(to24Hour(1, 5, 'PM')).toBe('13:05')
    expect(to24Hour(11, 45, 'PM')).toBe('23:45')
  })

  it('from24Hour inverts to24Hour', () => {
    for (const hhmm of ['00:00', '06:15', '12:00', '13:05', '23:59']) {
      const parts = from24Hour(hhmm)
      expect(parts).not.toBeNull()
      expect(to24Hour(parts!.h12, parts!.minute, parts!.meridiem)).toBe(hhmm)
    }
  })

  it('from24Hour rejects malformed input', () => {
    expect(from24Hour('9:00')).toBeNull()
    expect(from24Hour('24:00')).toBeNull()
    expect(from24Hour('')).toBeNull()
  })
})

describe('formatClockText', () => {
  it('pads minutes only', () => {
    expect(formatClockText(2, 5)).toBe('2:05')
    expect(formatClockText(12, 0)).toBe('12:00')
  })
})
