import { describe, expect, it } from 'vitest'
import { selectPastSessions } from './useSessionHistory'
import type { ScheduledActivityWithDate } from '@/api/scheduledActivities'
import type { ScheduledActivity } from '@/domain/types'

// `useSessionHistory` itself is a thin React `useState`/`useEffect` wrapper
// around this pure selector — this project's test suite runs in a plain Node
// environment with no jsdom/testing-library (see `vitest.config.ts`), the
// same reason `useNoteEntries.ts`/`useDisplayValueHistory.ts` have no test
// files of their own. `selectPastSessions` is split out specifically so the
// actual filter/sort/exclude logic stays fully testable without any of that
// — mirroring `lib/displayValuesLocalStore.ts`'s own
// `sortDisplayValueHistory` split.

function session(id: string, localDate: string, startMinutes: number, name = 'Vipassana'): ScheduledActivityWithDate {
  const activity: ScheduledActivity = {
    id,
    name,
    path: [],
    startMinutes,
    durationMinutes: 30,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    sleepQuality: [],
    dreamsNote: null,
    status: 'planned',
    timezone: 'UTC',
  }
  return { activity, localDate }
}

describe('selectPastSessions', () => {
  it('returns nothing for an empty input', () => {
    expect(selectPastSessions([], 'Vipassana', '2026-09-14')).toEqual([])
  })

  it('excludes the given date even if rows for it are present (already shown as Recent)', () => {
    const rows = [session('a', '2026-09-14', 8 * 60), session('b', '2026-09-13', 8 * 60)]
    const result = selectPastSessions(rows, 'Vipassana', '2026-09-14')
    expect(result.map((r) => r.activity.id)).toEqual(['b'])
  })

  it('filters to only the given quick-log name', () => {
    const rows = [session('a', '2026-09-10', 8 * 60, 'Vipassana'), session('b', '2026-09-10', 9 * 60, 'Exercise')]
    const result = selectPastSessions(rows, 'Vipassana', '2026-09-14')
    expect(result.map((r) => r.activity.id)).toEqual(['a'])
  })

  it('sorts most-recent calendar day first', () => {
    const rows = [session('old', '2026-08-01', 8 * 60), session('recent', '2026-09-10', 8 * 60), session('mid', '2026-09-01', 8 * 60)]
    const result = selectPastSessions(rows, 'Vipassana', '2026-09-14')
    expect(result.map((r) => r.activity.id)).toEqual(['recent', 'mid', 'old'])
  })

  it('within the same calendar day, sorts later time-of-day first', () => {
    const rows = [session('morning', '2026-09-10', 6 * 60), session('evening', '2026-09-10', 20 * 60)]
    const result = selectPastSessions(rows, 'Vipassana', '2026-09-14')
    expect(result.map((r) => r.activity.id)).toEqual(['evening', 'morning'])
  })

  it('never mutates the input array', () => {
    const rows = [session('a', '2026-09-10', 8 * 60), session('b', '2026-09-11', 8 * 60)]
    const copy = [...rows]
    selectPastSessions(rows, 'Vipassana', '2026-09-14')
    expect(rows).toEqual(copy)
  })
})
