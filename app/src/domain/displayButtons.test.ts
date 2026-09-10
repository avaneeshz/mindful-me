import { describe, expect, it } from 'vitest'
import { formatDisplayValue, parseDisplayValue } from './displayButtons'

describe('formatDisplayValue', () => {
  it('shows an em dash when nothing is logged', () => {
    expect(formatDisplayValue('vipassana', null)).toBe('—')
    expect(formatDisplayValue('steps', null)).toBe('—')
  })

  it('formats Vipassana minutes as a compact duration', () => {
    expect(formatDisplayValue('vipassana', 0)).toBe('0m')
    expect(formatDisplayValue('vipassana', 40)).toBe('40m')
    expect(formatDisplayValue('vipassana', 75)).toBe('1h 15m')
    expect(formatDisplayValue('vipassana', 120)).toBe('2h')
  })

  it('keeps Steps as a grouped integer up to 999', () => {
    expect(formatDisplayValue('steps', 0)).toBe('0')
    expect(formatDisplayValue('steps', 840)).toBe('840')
    expect(formatDisplayValue('steps', 999)).toBe('999')
  })

  it('abbreviates Steps past 999 with a k suffix', () => {
    expect(formatDisplayValue('steps', 1000)).toBe('1k')
    expect(formatDisplayValue('steps', 1100)).toBe('1.1k')
    expect(formatDisplayValue('steps', 1050)).toBe('1.1k')
    expect(formatDisplayValue('steps', 12345)).toBe('12.3k')
    expect(formatDisplayValue('steps', 9999)).toBe('10k')
    expect(formatDisplayValue('steps', 250000)).toBe('250k')
  })
})

describe('parseDisplayValue', () => {
  it('accepts a non-negative integer', () => {
    expect(parseDisplayValue('0')).toBe(0)
    expect(parseDisplayValue('8000')).toBe(8000)
    expect(parseDisplayValue('  20 ')).toBe(20)
  })

  it('rejects blanks, negatives, decimals and junk', () => {
    expect(parseDisplayValue('')).toBeNull()
    expect(parseDisplayValue('-5')).toBeNull()
    expect(parseDisplayValue('1.5')).toBeNull()
    expect(parseDisplayValue('abc')).toBeNull()
  })
})
