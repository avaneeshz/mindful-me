import { describe, expect, it } from 'vitest'
import {
  BOARD_END_MIN,
  BOARD_START_MIN,
  activityBoardStart,
  boardStartToStorage,
  clockMinutesToBoard,
  dayDelta,
  isoAddDays,
  slotBoardRange,
  toBoardActivities,
} from './window'
import type { ScheduledActivity } from './types'

function act(localDate: string, startMinutes: number, durationMinutes = 30): ScheduledActivity {
  return {
    id: `${localDate}-${startMinutes}`,
    name: 'Homework',
    path: [],
    localDate,
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    status: 'planned',
    timezone: 'UTC',
  }
}

const WIN = '2026-09-11'

describe('isoAddDays / dayDelta', () => {
  it('adds and subtracts whole days across month boundaries', () => {
    expect(isoAddDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(isoAddDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('dayDelta is 0 same day, +1 the day after the window, -1 the day before', () => {
    expect(dayDelta(WIN, '2026-09-11')).toBe(0)
    expect(dayDelta(WIN, '2026-09-12')).toBe(1)
    expect(dayDelta(WIN, '2026-09-10')).toBe(-1)
  })
})

describe('activityBoardStart — position on the current window board', () => {
  it('an activity on the window day sits at its own minute-of-day', () => {
    expect(activityBoardStart(act(WIN, 600), WIN)).toBe(600) // 10:00
    expect(activityBoardStart(act(WIN, 1320), WIN)).toBe(1320) // 22:00
  })

  it('an activity on the NEXT calendar day sits in the small hours (1440–1800)', () => {
    expect(activityBoardStart(act('2026-09-12', 0), WIN)).toBe(1440) // midnight
    expect(activityBoardStart(act('2026-09-12', 120), WIN)).toBe(1560) // 02:00
    expect(activityBoardStart(act('2026-09-12', 359), WIN)).toBe(1799) // 05:59
  })

  it('a midnight-crosser from the PREVIOUS window day starts negative', () => {
    // 22:00 on the 10th, viewed on the 11th's window.
    expect(activityBoardStart(act('2026-09-10', 1320), WIN)).toBe(1320 - 1440)
  })
})

describe('slotBoardRange — 0–47 grid cell to board minutes', () => {
  it('day + evening cells keep minute-of-day', () => {
    expect(slotBoardRange(12)).toEqual({ start: 360, end: 390 }) // 06:00
    expect(slotBoardRange(35)).toEqual({ start: 1050, end: 1080 }) // 17:30
    expect(slotBoardRange(36)).toEqual({ start: 1080, end: 1110 }) // 18:00
    expect(slotBoardRange(47)).toEqual({ start: 1410, end: 1440 }) // 23:30
  })

  it('small-hours cells (0–11) map onto the next day, board 1440–1800', () => {
    expect(slotBoardRange(0)).toEqual({ start: 1440, end: 1470 }) // 00:00 next day
    expect(slotBoardRange(11)).toEqual({ start: 1770, end: 1800 }) // 05:30 next day
  })

  it('every cell lands inside the visible window', () => {
    for (let slot = 0; slot < 48; slot += 1) {
      const { start, end } = slotBoardRange(slot)
      expect(start).toBeGreaterThanOrEqual(BOARD_START_MIN)
      expect(end).toBeLessThanOrEqual(BOARD_END_MIN)
    }
  })
})

describe('boardStartToStorage — resolved board minute back to a stored row', () => {
  it('a board minute before midnight stays on the window day', () => {
    expect(boardStartToStorage(600, WIN)).toEqual({ localDate: WIN, startMinutes: 600 })
    expect(boardStartToStorage(1439, WIN)).toEqual({ localDate: WIN, startMinutes: 1439 })
  })

  it('a board minute at/after midnight rolls to the next calendar day', () => {
    expect(boardStartToStorage(1440, WIN)).toEqual({ localDate: '2026-09-12', startMinutes: 0 })
    expect(boardStartToStorage(1560, WIN)).toEqual({ localDate: '2026-09-12', startMinutes: 120 })
  })

  it('round-trips with activityBoardStart', () => {
    for (const [d, m] of [
      [WIN, 600],
      [WIN, 1320],
      ['2026-09-12', 0],
      ['2026-09-12', 300],
    ] as const) {
      const board = activityBoardStart(act(d, m), WIN)
      expect(boardStartToStorage(board, WIN)).toEqual({ localDate: d, startMinutes: m })
    }
  })
})

describe('clockMinutesToBoard — a typed HH:MM to a board minute', () => {
  it('06:00 and later are unchanged', () => {
    expect(clockMinutesToBoard(360)).toBe(360)
    expect(clockMinutesToBoard(1380)).toBe(1380) // 23:00
  })

  it('before 06:00 is the following morning', () => {
    expect(clockMinutesToBoard(0)).toBe(1440)
    expect(clockMinutesToBoard(120)).toBe(1560) // 02:00
    expect(clockMinutesToBoard(359)).toBe(1799)
  })
})

describe('toBoardActivities', () => {
  it('maps a mixed-day list onto one axis, leaving everything else intact', () => {
    const list = [act(WIN, 600), act('2026-09-12', 120, 45)]
    const mapped = toBoardActivities(list, WIN)
    expect(mapped[0].startMinutes).toBe(600)
    expect(mapped[1].startMinutes).toBe(1560)
    expect(mapped[1]).toMatchObject({ id: list[1].id, durationMinutes: 45, localDate: '2026-09-12' })
  })
})
