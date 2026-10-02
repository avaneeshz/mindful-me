import { describe, expect, it } from 'vitest'
import { axisFromClock, axisToStorage, dayOf, rolloverDay, startingInDay, storageToAxis } from './dayAxis'

describe('dayOf — the day runs 06:00 → 06:00', () => {
  it('puts 05:59 on the day before, and 06:00 on the date itself', () => {
    expect(dayOf(new Date(2026, 9, 3, 5, 59))).toBe('2026-10-02')
    expect(dayOf(new Date(2026, 9, 3, 6, 0))).toBe('2026-10-03')
    expect(dayOf(new Date(2026, 9, 2, 23, 30))).toBe('2026-10-02')
  })
})

describe('axis ↔ storage', () => {
  it('stores 01:30 on the Oct 2 page under Oct 3 (rule 2: the date it starts on)', () => {
    const axisMinute = axisFromClock(90)
    expect(axisMinute).toBe(1440 + 90)
    expect(axisToStorage('2026-10-02', axisMinute)).toEqual({ date: '2026-10-03', startMinutes: 90 })
    expect(storageToAxis('2026-10-02', '2026-10-03', 90)).toBe(axisMinute)
  })

  it('keeps times from 06:00 on the viewed date itself', () => {
    expect(axisFromClock(6 * 60)).toBe(6 * 60)
    expect(axisToStorage('2026-10-02', 23 * 60)).toEqual({ date: '2026-10-02', startMinutes: 23 * 60 })
  })

  it('places the evening before at negative minutes', () => {
    expect(axisToStorage('2026-10-02', -120)).toEqual({ date: '2026-10-01', startMinutes: 22 * 60 })
  })
})

describe('startingInDay', () => {
  it('keeps only what starts between 06:00 and 06:00 the next morning', () => {
    const at = (startMinutes: number) => ({ startMinutes })
    expect(startingInDay([at(-120), at(300), at(360), at(1439), at(1440 + 300), at(1800)])).toEqual([
      at(360),
      at(1439),
      at(1440 + 300),
    ])
  })
})

/**
 * The rollover rule behind the "today" default: a board left open across the
 * day boundary (now 06:00, not midnight) picks up the new day by itself, but
 * a day the user deliberately picked is never moved (rule 12). Only the state
 * from just BEFORE the tick decides it was following today.
 */
describe('rolloverDay', () => {
  const oct2Evening = new Date(2026, 9, 2, 22, 0)
  const oct3Night = new Date(2026, 9, 3, 1, 0)
  const oct3Dawn = new Date(2026, 9, 3, 6, 0)

  it('does not roll over at midnight — 01:00 is still the Oct 2 day', () => {
    expect(rolloverDay('2026-10-02', oct2Evening, oct3Night)).toBeNull()
  })

  it('rolls over at 06:00 while following today', () => {
    expect(rolloverDay('2026-10-02', oct3Night, oct3Dawn)).toBe('2026-10-03')
  })

  it('never moves a day the user pinned (rule 12)', () => {
    expect(rolloverDay('2026-09-20', oct3Night, oct3Dawn)).toBeNull()
    expect(rolloverDay('2026-10-04', oct3Night, oct3Dawn)).toBeNull()
  })

  it('catches up straight to the current day after a long suspend', () => {
    expect(rolloverDay('2026-10-02', oct2Evening, new Date(2026, 9, 6, 9, 0))).toBe('2026-10-06')
  })

  it('does nothing once already caught up', () => {
    expect(rolloverDay('2026-10-03', oct3Dawn, new Date(2026, 9, 3, 9, 0))).toBeNull()
  })
})
