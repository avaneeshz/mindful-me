import { describe, expect, it } from 'vitest'
import { reconcileServerActivities } from './reconcileServerActivities'
import type { ScheduledActivity } from '@/domain/types'

function activity(id: string, overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id,
    name: 'Homework',
    path: [],
    startMinutes: 480,
    durationMinutes: 30,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    status: 'planned',
    timezone: 'UTC',
    ...overrides,
  }
}

const EMPTY = new Set<string>()

describe('reconcileServerActivities — Bug A (destructive overwrite on reconciliation)', () => {
  it('a local activity with a pending unsynced create survives an EMPTY server response', () => {
    const local = [activity('local-1')]
    const merged = reconcileServerActivities(local, [], new Set(['local-1']), EMPTY)
    expect(merged).toEqual([activity('local-1')])
  })

  it('a local activity with NOTHING pending is dropped when the server genuinely has nothing (legitimate empty state, or deleted elsewhere)', () => {
    const local = [activity('local-1')]
    const merged = reconcileServerActivities(local, [], EMPTY, EMPTY)
    expect(merged).toEqual([])
  })

  it('a pending local edit wins over a stale server copy of the same activity', () => {
    const local = [activity('a1', { durationMinutes: 90 })]
    const server = [activity('a1', { durationMinutes: 30 })] // server hasn't seen the edit yet
    const merged = reconcileServerActivities(local, server, new Set(['a1']), EMPTY)
    expect(merged).toEqual([activity('a1', { durationMinutes: 90 })])
  })

  it('the server wins for an activity with nothing outstanding — picks up an edit made on another device', () => {
    const local = [activity('a1', { durationMinutes: 30 })]
    const server = [activity('a1', { durationMinutes: 60 })] // edited elsewhere, already confirmed
    const merged = reconcileServerActivities(local, server, EMPTY, EMPTY)
    expect(merged).toEqual([activity('a1', { durationMinutes: 60 })])
  })

  it('an outstanding local delete keeps the server’s stale (not-yet-deleted) copy OUT of the merge', () => {
    // removeActivity already dropped it from local state; the server just hasn't heard yet.
    const local: ScheduledActivity[] = []
    const server = [activity('a1')]
    const merged = reconcileServerActivities(local, server, EMPTY, new Set(['a1']))
    expect(merged).toEqual([])
  })

  it('the server introduces a brand-new activity (created on another device) with nothing pending locally', () => {
    const local = [activity('a1')]
    const server = [activity('a1'), activity('a2')]
    const merged = reconcileServerActivities(local, server, EMPTY, EMPTY)
    expect(merged.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('multiple activities each resolve independently — pending, deleted, and server-authoritative all in one pass', () => {
    const local = [
      activity('unsynced-create', { name: 'Meditate' }),
      activity('edited-locally', { durationMinutes: 45 }),
    ]
    const server = [
      activity('edited-locally', { durationMinutes: 15 }), // stale — local pending edit should win
      activity('deleted-elsewhere-confirmed', { name: 'Old thing' }), // nothing pending — trust server
      activity('being-deleted-locally'), // pending delete — must not resurrect
    ]
    const merged = reconcileServerActivities(
      local,
      server,
      new Set(['unsynced-create', 'edited-locally']),
      new Set(['being-deleted-locally']),
    )
    const byId = new Map(merged.map((a) => [a.id, a]))
    expect(byId.has('unsynced-create')).toBe(true)
    expect(byId.get('edited-locally')?.durationMinutes).toBe(45)
    expect(byId.has('deleted-elsewhere-confirmed')).toBe(true)
    expect(byId.has('being-deleted-locally')).toBe(false)
    expect(merged).toHaveLength(3)
  })

  it('is a true no-op when local and server already agree and nothing is pending', () => {
    const shared = [activity('a1'), activity('a2')]
    const merged = reconcileServerActivities(shared, shared, EMPTY, EMPTY)
    expect(merged.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('handles both empty inputs', () => {
    expect(reconcileServerActivities([], [], EMPTY, EMPTY)).toEqual([])
  })
})
