import { describe, expect, it } from 'vitest'
import type { ScheduledActivity } from '@/domain/types'
import { boardActivitiesFromDates, boardActivitiesToDates, boardDates, storedSyncBatches } from './boardDays'
import { boardReducer, createInitialState } from './boardReducer'
import { deriveSyncIntents } from './sync'

function entry(id: string, startMinutes: number, durationMinutes: number, name: string | null = 'Homework'): ScheduledActivity {
  return {
    id,
    name,
    path: [],
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    fieldSelections: {},
    dreamsNote: null,
    status: 'planned',
    timezone: 'UTC',
  }
}

const DAY = '2026-10-02'

describe('boardDates', () => {
  it('is the day before, the day, and the day after', () => {
    expect(boardDates(DAY)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })
})

describe('board ↔ calendar dates', () => {
  const stored = {
    '2026-10-01': [entry('sleep', 22 * 60, 9 * 60)],
    '2026-10-02': [entry('work', 9 * 60, 60), entry('marker', 10 * 60, 0, null), entry('early', 2 * 60, 30)],
    '2026-10-03': [entry('night', 90, 30)],
  }

  it('lays the three dates on the Oct 2 axis — Oct 3 01:30 comes after Oct 2 evening', () => {
    const board = boardActivitiesFromDates(DAY, stored)
    expect(board.map((a) => [a.id, a.startMinutes])).toEqual([
      ['sleep', -120],
      ['early', 120],
      ['work', 540],
      ['marker', 600],
      ['night', 1440 + 90],
    ])
  })

  it('round-trips back to exactly what was stored — legacy flag markers included', () => {
    const back = boardActivitiesToDates(DAY, boardActivitiesFromDates(DAY, stored))
    expect(back['2026-10-01']).toEqual(stored['2026-10-01'])
    expect(back['2026-10-03']).toEqual(stored['2026-10-03'])
    expect(back['2026-10-02'].map((a) => a.id).sort()).toEqual(['early', 'marker', 'work'])
    expect(back['2026-10-02'].find((a) => a.id === 'marker')).toEqual(stored['2026-10-02'][1])
  })

  it('always returns all three dates, so an emptied date is saved as empty', () => {
    expect(boardActivitiesToDates(DAY, [])).toEqual({ '2026-10-01': [], '2026-10-02': [], '2026-10-03': [] })
  })
})

describe('logging on the Night row after midnight — end to end through the reducer', () => {
  const AT_8PM = new Date(2026, 9, 2, 20, 0)

  it('stores and syncs an entry picked in the 01:00 cell on the Oct 2 page as Oct 3, 01:00', () => {
    let state = createInitialState([], AT_8PM)
    const steps = [
      { type: 'selectSlot', slot: 2 } as const, // 01:00 – 01:30
      { type: 'pickCard', cardName: 'Homework' } as const,
      { type: 'commit' } as const,
    ]
    let prev = state
    for (const action of steps) {
      prev = state
      state = boardReducer(state, action)
    }
    const logged = state.activities.find((a) => a.name === 'Homework')!
    expect(logged.startMinutes).toBe(1440 + 60)

    const byDate = boardActivitiesToDates(DAY, state.activities)
    expect(byDate['2026-10-02']).toEqual([])
    expect(byDate['2026-10-03']).toEqual([{ ...logged, startMinutes: 60 }])

    const batches = storedSyncBatches(DAY, deriveSyncIntents(steps[2], prev, state), prev.activities, state.activities)
    expect(batches).toEqual([{ date: '2026-10-03', intents: [{ kind: 'create', activity: { ...logged, startMinutes: 60 } }] }])
  })
})

describe('storedSyncBatches', () => {
  it('queues a reschedule that crosses midnight against the new date, with that date’s minutes', () => {
    const moved = entry('a', 1440 + 15, 30)
    expect(storedSyncBatches(DAY, [{ kind: 'reschedule', activity: moved }], [entry('a', 23 * 60, 30)], [moved])).toEqual([
      { date: '2026-10-03', intents: [{ kind: 'reschedule', activity: entry('a', 15, 30) }] },
    ])
  })

  it('sends a delete with the date its activity was stored under', () => {
    const removed = entry('gone', 1440 + 120, 30)
    expect(storedSyncBatches(DAY, [{ kind: 'delete', id: 'gone' }], [removed], [])).toEqual([
      { date: '2026-10-03', intents: [{ kind: 'delete', id: 'gone' }] },
    ])
  })

  it('groups intents per date', () => {
    const a = entry('a', 600, 30)
    const b = entry('b', 1440 + 60, 30)
    const batches = storedSyncBatches(
      DAY,
      [
        { kind: 'status', activity: a },
        { kind: 'status', activity: b },
      ],
      [a, b],
      [a, b],
    )
    expect(batches.map((batch) => batch.date)).toEqual(['2026-10-02', '2026-10-03'])
  })
})
