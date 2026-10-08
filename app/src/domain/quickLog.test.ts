import { describe, expect, it } from 'vitest'
import { formatMinutesLabel, totalMinutesFor } from './quickLog'

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
