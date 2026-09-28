import { describe, expect, it } from 'vitest'
import type { ScheduledActivity } from '@/domain/types'
import { reconcileDays } from './reconcileDays'

function make(id: string, startMinutes: number): ScheduledActivity {
  return {
    id,
    name: id,
    path: [],
    startMinutes,
    durationMinutes: 30,
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

const dates = ['2026-09-11', '2026-09-12', '2026-09-13']

describe('reconcileDays', () => {
  it('files server rows under their own dates and ignores dates outside the window', () => {
    const result = reconcileDays(
      dates,
      {},
      [
        { activity: make('a', 600), localDate: '2026-09-12' },
        { activity: make('b', 60), localDate: '2026-09-13' },
        { activity: make('z', 60), localDate: '2026-09-14' },
      ],
      new Set(),
      new Set(),
    )
    expect(result['2026-09-12'].map((a) => a.id)).toEqual(['a'])
    expect(result['2026-09-13'].map((a) => a.id)).toEqual(['b'])
    expect(result['2026-09-11']).toEqual([])
  })

  it('keeps an unconfirmed move across midnight where it now is, with no duplicate', () => {
    const movedLocally = { ...make('f', 30), notes: 'moved' }
    const result = reconcileDays(
      dates,
      { '2026-09-13': [movedLocally] },
      [{ activity: make('f', 1410), localDate: '2026-09-12' }],
      new Set(['f']),
      new Set(),
    )
    expect(result['2026-09-12']).toEqual([])
    expect(result['2026-09-13']).toEqual([movedLocally])
  })

  it('keeps unsynced creates and drops unconfirmed deletes', () => {
    const result = reconcileDays(
      dates,
      { '2026-09-12': [make('new', 700)] },
      [{ activity: make('gone', 800), localDate: '2026-09-12' }],
      new Set(['new']),
      new Set(['gone']),
    )
    expect(result['2026-09-12'].map((a) => a.id)).toEqual(['new'])
  })

  it('trusts the server over a stale local copy once nothing is pending', () => {
    const result = reconcileDays(
      dates,
      { '2026-09-12': [make('x', 600), make('deletedElsewhere', 900)] },
      [{ activity: { ...make('x', 630) }, localDate: '2026-09-12' }],
      new Set(),
      new Set(),
    )
    expect(result['2026-09-12'].map((a) => [a.id, a.startMinutes])).toEqual([['x', 630]])
  })
})
