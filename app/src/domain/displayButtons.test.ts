import { describe, expect, it } from 'vitest'
import {
  displayButtonQuickLogDreamsNote,
  displayButtonQuickLogName,
  displayButtonQuickLogNote,
  displayButtonQuickLogSleepQuality,
  displayButtonQuickLogType,
  displayButtonQuickLogTypeLabel,
  displayButtonSynced,
  displayButtonTarget,
  formatDisplayValue,
  formatTargetRelativeValue,
  parseDisplayValue,
} from './displayButtons'

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

describe('quick-log buttons (Exercise/Breathing/Sleep)', () => {
  it('maps each to its EXISTING catalog identity — no parallel identity minted', () => {
    expect(displayButtonQuickLogName('exercise')).toBe('Sports or Exercise')
    expect(displayButtonQuickLogName('breathing')).toBe('Breathwork')
    expect(displayButtonQuickLogName('sleep')).toBe('Sleep')
    expect(displayButtonQuickLogName('vipassana')).toBe('Vipassana')
    expect(displayButtonQuickLogName('steps')).toBeNull()
    expect(displayButtonQuickLogName('protein')).toBeNull()
  })

  it('offers a type field only for Exercise and Sleep, not Breathing or Vipassana', () => {
    expect(displayButtonQuickLogType('exercise')).toBe(true)
    expect(displayButtonQuickLogType('sleep')).toBe(true)
    expect(displayButtonQuickLogType('breathing')).toBe(false)
    expect(displayButtonQuickLogType('vipassana')).toBe(false)
  })

  it('labels the type field per button', () => {
    expect(displayButtonQuickLogTypeLabel('exercise')).toBe('Type')
    expect(displayButtonQuickLogTypeLabel('sleep')).toBe('Sleep type')
  })

  it('offers a plain note field for Exercise, Breathing and Sleep, not Vipassana', () => {
    expect(displayButtonQuickLogNote('exercise')).toBe(true)
    expect(displayButtonQuickLogNote('breathing')).toBe(true)
    expect(displayButtonQuickLogNote('sleep')).toBe(true)
    expect(displayButtonQuickLogNote('vipassana')).toBe(false)
  })

  it('offers sleep-quality and dreams fields only for Sleep', () => {
    for (const key of ['exercise', 'breathing', 'vipassana', 'steps', 'protein'] as const) {
      expect(displayButtonQuickLogSleepQuality(key)).toBe(false)
      expect(displayButtonQuickLogDreamsNote(key)).toBe(false)
    }
    expect(displayButtonQuickLogSleepQuality('sleep')).toBe(true)
    expect(displayButtonQuickLogDreamsNote('sleep')).toBe(true)
  })
})

describe('synced vs. local-only day-value buttons', () => {
  it('Protein is synced; Steps stays local-only', () => {
    expect(displayButtonSynced('protein')).toBe(true)
    expect(displayButtonSynced('steps')).toBe(false)
  })

  it('every quick-log button is unaffected by the synced flag (its value is always computed, never stored directly)', () => {
    expect(displayButtonSynced('vipassana')).toBe(false)
    expect(displayButtonSynced('exercise')).toBe(false)
  })
})

describe('formatTargetRelativeValue', () => {
  it('formats "value/target"', () => {
    expect(formatTargetRelativeValue(45, 80)).toBe('45/80')
    expect(formatTargetRelativeValue(80, 80)).toBe('80/80')
    expect(formatTargetRelativeValue(120, 80)).toBe('120/80') // over target — still shown plainly, not clamped
  })

  it('shows 0/target rather than an em dash when nothing is logged', () => {
    expect(formatTargetRelativeValue(null, 80)).toBe('0/80')
  })
})

describe('formatDisplayValue for a target-relative button (Protein)', () => {
  it('reads its fixed daily target from the config', () => {
    expect(displayButtonTarget('protein')).toBe(80)
    expect(displayButtonTarget('steps')).toBeNull()
    expect(displayButtonTarget('vipassana')).toBeNull()
  })

  it('formats against the target, including at zero — never the plain em dash', () => {
    expect(formatDisplayValue('protein', null)).toBe('0/80')
    expect(formatDisplayValue('protein', 45)).toBe('45/80')
    expect(formatDisplayValue('protein', 80)).toBe('80/80')
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
