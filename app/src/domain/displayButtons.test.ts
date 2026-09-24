import { describe, expect, it } from 'vitest'
import {
  displayButtonInput,
  displayButtonQuickLogDreamsNote,
  displayButtonQuickLogName,
  displayButtonMultiselectFields,
  displayButtonQuickLogNote,
  displayButtonQuickLogType,
  displayButtonQuickLogTypeLabel,
  displayButtonSynced,
  displayButtonTarget,
  formatDisplayValue,
  formatTargetRelativeValue,
  parseDisplayValue,
  songCountToMinutes,
  WORSHIP_MINUTES_PER_SONG,
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

describe('quick-log buttons (Exercise/Breathing/Sleep/Prayer/Sermons/Worship)', () => {
  it('maps each to its catalog identity — Exercise/Breathing reuse an EXISTING card, Sleep/Prayer/Sermons/Worship are genuinely new ones, never a parallel identity', () => {
    expect(displayButtonQuickLogName('exercise')).toBe('Sports or Exercise')
    expect(displayButtonQuickLogName('breathing')).toBe('Breathwork')
    expect(displayButtonQuickLogName('sleep')).toBe('Sleep')
    expect(displayButtonQuickLogName('vipassana')).toBe('Vipassana')
    expect(displayButtonQuickLogName('prayer')).toBe('Prayer')
    expect(displayButtonQuickLogName('sermons')).toBe('Sermons')
    expect(displayButtonQuickLogName('worship')).toBe('Worship')
    expect(displayButtonQuickLogName('steps')).toBeNull()
    expect(displayButtonQuickLogName('protein')).toBeNull()
  })

  it('offers a type field for Exercise, Breathing, Sleep and Prayer, not Vipassana/Sermons/Worship', () => {
    expect(displayButtonQuickLogType('exercise')).toBe(true)
    expect(displayButtonQuickLogType('breathing')).toBe(true)
    expect(displayButtonQuickLogType('sleep')).toBe(true)
    expect(displayButtonQuickLogType('prayer')).toBe(true)
    expect(displayButtonQuickLogType('vipassana')).toBe(false)
    expect(displayButtonQuickLogType('sermons')).toBe(false)
    expect(displayButtonQuickLogType('worship')).toBe(false)
  })

  it('labels the type field per button', () => {
    expect(displayButtonQuickLogTypeLabel('exercise')).toBe('Type')
    expect(displayButtonQuickLogTypeLabel('breathing')).toBe('Type')
    expect(displayButtonQuickLogTypeLabel('sleep')).toBe('Sleep type')
    expect(displayButtonQuickLogTypeLabel('prayer')).toBe('Type')
  })

  it('offers a plain note field for Exercise, Breathing, Sleep, Prayer, Sermons and Worship, not Vipassana', () => {
    expect(displayButtonQuickLogNote('exercise')).toBe(true)
    expect(displayButtonQuickLogNote('breathing')).toBe(true)
    expect(displayButtonQuickLogNote('sleep')).toBe(true)
    expect(displayButtonQuickLogNote('prayer')).toBe(true)
    expect(displayButtonQuickLogNote('sermons')).toBe(true)
    expect(displayButtonQuickLogNote('worship')).toBe(true)
    expect(displayButtonQuickLogNote('vipassana')).toBe(false)
  })

  it('offers a sleep-quality multiselect field and a dreams field only for Sleep', () => {
    for (const key of ['exercise', 'breathing', 'vipassana', 'prayer', 'sermons', 'worship', 'steps', 'protein'] as const) {
      expect(displayButtonMultiselectFields(key)).toEqual([])
      expect(displayButtonQuickLogDreamsNote(key)).toBe(false)
    }
    const sleepFields = displayButtonMultiselectFields('sleep')
    expect(sleepFields).toHaveLength(1)
    expect(sleepFields[0].label).toBe('How was your sleep?')
    expect(sleepFields[0].options).toContain('Deep Restorative')
    expect(displayButtonQuickLogDreamsNote('sleep')).toBe(true)
  })
})

describe('Worship’s songCount entry mode', () => {
  it('is the only button using the songCount input mode', () => {
    expect(displayButtonInput('worship')).toBe('songCount')
    for (const key of ['vipassana', 'exercise', 'breathing', 'sleep', 'prayer', 'sermons'] as const) {
      expect(displayButtonInput(key)).toBe('duration')
    }
    expect(displayButtonInput('steps')).toBe('number')
    expect(displayButtonInput('protein')).toBe('number')
  })

  it('WORSHIP_MINUTES_PER_SONG is the confirmed product number, 3', () => {
    expect(WORSHIP_MINUTES_PER_SONG).toBe(3)
  })

  it('songCountToMinutes multiplies a song count by WORSHIP_MINUTES_PER_SONG', () => {
    expect(songCountToMinutes(1)).toBe(3)
    expect(songCountToMinutes(4)).toBe(12)
    expect(songCountToMinutes(10)).toBe(30)
  })

  it('songCountToMinutes rejects null, zero, negative and non-integer counts', () => {
    expect(songCountToMinutes(null)).toBeNull()
    expect(songCountToMinutes(0)).toBeNull()
    expect(songCountToMinutes(-2)).toBeNull()
    expect(songCountToMinutes(1.5)).toBeNull()
  })
})

describe('synced day-value buttons', () => {
  it('both Steps and Protein are synced to public.daily_values', () => {
    expect(displayButtonSynced('protein')).toBe(true)
    expect(displayButtonSynced('steps')).toBe(true)
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
