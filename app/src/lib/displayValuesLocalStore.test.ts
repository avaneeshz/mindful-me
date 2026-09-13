import { describe, expect, it } from 'vitest'
import { sortDisplayValueHistory } from './displayValuesLocalStore'

/**
 * `sortDisplayValueHistory` is the one piece of real logic behind a
 * day-value button's history list (Steps/Protein — see
 * `state/useDisplayValueHistory.ts`) — everything else in this module is
 * `localStorage` I/O, untested at this layer for the same reason
 * `state/dismissedActivities.ts`'s own `toggleDismissedName` is tested this
 * way: a thin, fail-closed pass-through with nothing to assert beyond
 * "doesn't throw", which this pure sort doesn't depend on.
 */
describe('sortDisplayValueHistory', () => {
  it('is empty for an empty map', () => {
    expect(sortDisplayValueHistory({})).toEqual([])
  })

  it('orders every day most-recent-first', () => {
    expect(
      sortDisplayValueHistory({
        '2026-09-01': 4000,
        '2026-09-13': 8200,
        '2026-09-05': 6100,
      }),
    ).toEqual([
      { date: '2026-09-13', value: 8200 },
      { date: '2026-09-05', value: 6100 },
      { date: '2026-09-01', value: 4000 },
    ])
  })

  it('handles a single day', () => {
    expect(sortDisplayValueHistory({ '2026-09-13': 80 })).toEqual([{ date: '2026-09-13', value: 80 }])
  })

  it('is correct across a year boundary (plain ISO string ordering, no date parsing)', () => {
    expect(
      sortDisplayValueHistory({
        '2025-12-31': 1,
        '2026-01-01': 2,
      }),
    ).toEqual([
      { date: '2026-01-01', value: 2 },
      { date: '2025-12-31', value: 1 },
    ])
  })
})
