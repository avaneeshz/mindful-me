import { describe, expect, it } from 'vitest'
import type { ScheduledActivity } from '@/domain/types'
import { reconcileActivities } from './reconcile'
import type { PendingEdit } from './syncQueue'

function activity(id: string, overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id,
    name: 'Homework',
    path: [],
    startMinutes: 600,
    durationMinutes: 30,
    flags: [],
    status: 'planned',
    timezone: 'Asia/Kolkata',
    ...overrides,
  }
}

function pending(entries: Record<string, Partial<PendingEdit> & { editedAt: string }>) {
  return new Map<string, PendingEdit>(
    Object.entries(entries).map(([id, edit]) => [
      id,
      { removes: false, creates: false, ...edit },
    ]),
  )
}

const EARLIER = '2026-08-27T10:00:00.000Z'
const LATER = '2026-08-27T10:05:00.000Z'

describe('reconcileActivities — nothing queued', () => {
  it('takes the server’s view wholesale (it IS this device’s last write)', () => {
    const result = reconcileActivities({
      local: [activity('a', { durationMinutes: 30 })],
      server: [activity('a', { durationMinutes: 90, updatedAt: LATER })],
      pending: new Map(),
    })

    expect(result.activities).toHaveLength(1)
    expect(result.activities[0].durationMinutes).toBe(90)
    expect(result.conflicts).toEqual([])
    expect(result.changed).toBe(true)
  })

  it('drops a local activity the server no longer has — it was deleted elsewhere', () => {
    const result = reconcileActivities({
      local: [activity('a'), activity('b', { startMinutes: 900 })],
      server: [activity('a', { updatedAt: EARLIER })],
      pending: new Map(),
    })

    expect(result.activities.map((a) => a.id)).toEqual(['a'])
    expect(result.changed).toBe(true)
  })

  it('reports no change when the two views already agree — a background reconcile must not clear staging', () => {
    const local = [activity('a'), activity('b', { startMinutes: 900 })]
    const result = reconcileActivities({
      local,
      server: [
        activity('b', { startMinutes: 900, updatedAt: EARLIER }),
        activity('a', { updatedAt: EARLIER }),
      ],
      pending: new Map(),
    })

    expect(result.changed).toBe(false)
    expect(result.conflicts).toEqual([])
  })
})

describe('reconcileActivities — rule 7 last-write-wins', () => {
  it('keeps the local edit when it is newer than the server’s row', () => {
    const result = reconcileActivities({
      local: [activity('a', { durationMinutes: 90 })],
      server: [activity('a', { durationMinutes: 30, updatedAt: EARLIER })],
      pending: pending({ a: { editedAt: LATER } }),
    })

    expect(result.activities[0].durationMinutes).toBe(90)
    expect(result.conflicts).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('lets the server win when ANOTHER device edited later — and names the loser', () => {
    const mine = activity('a', { durationMinutes: 90 })
    const result = reconcileActivities({
      local: [mine],
      server: [activity('a', { durationMinutes: 45, updatedAt: LATER })],
      pending: pending({ a: { editedAt: EARLIER } }),
    })

    expect(result.activities[0].durationMinutes).toBe(45)
    expect(result.changed).toBe(true)
    expect(result.conflicts).toEqual([
      { activityId: 'a', serverUpdatedAt: LATER, localSnapshot: mine },
    ])
  })

  it('breaks an exact tie in favour of the local edit (it has not been sent yet)', () => {
    const result = reconcileActivities({
      local: [activity('a', { durationMinutes: 90 })],
      server: [activity('a', { durationMinutes: 45, updatedAt: EARLIER })],
      pending: pending({ a: { editedAt: EARLIER } }),
    })

    expect(result.activities[0].durationMinutes).toBe(90)
    expect(result.conflicts).toEqual([])
  })

  it('keeps the local edit when the server row carries no updated_at at all', () => {
    const result = reconcileActivities({
      local: [activity('a', { durationMinutes: 90 })],
      server: [activity('a', { durationMinutes: 45 })],
      pending: pending({ a: { editedAt: EARLIER } }),
    })

    expect(result.activities[0].durationMinutes).toBe(90)
    expect(result.conflicts).toEqual([])
  })

  it('compares real instants, not string order, across differing timestamp formats', () => {
    // Postgres/PostgREST renders `+00:00`; the device stamps `Z`. Comparing
    // these lexicographically would order them wrongly.
    const result = reconcileActivities({
      local: [activity('a', { durationMinutes: 90 })],
      server: [activity('a', { durationMinutes: 45, updatedAt: '2026-08-27T10:05:00.123456+00:00' })],
      pending: pending({ a: { editedAt: '2026-08-27T10:00:00.000Z' } }),
    })

    expect(result.activities[0].durationMinutes).toBe(45)
    expect(result.conflicts).toHaveLength(1)
  })
})

describe('reconcileActivities — unsent local work', () => {
  it('keeps an activity created offline that the server has never seen', () => {
    const result = reconcileActivities({
      local: [activity('new')],
      server: [],
      pending: pending({ new: { editedAt: LATER, creates: true } }),
    })

    expect(result.activities.map((a) => a.id)).toEqual(['new'])
    expect(result.changed).toBe(false)
  })

  it('keeps a queued delete applied locally when it is the newer edit', () => {
    // Removed on this device; the server still has the row until the queue
    // flushes. The board must not show it again in the meantime.
    const result = reconcileActivities({
      local: [],
      server: [activity('a', { updatedAt: EARLIER })],
      pending: pending({ a: { editedAt: LATER, removes: true } }),
    })

    expect(result.activities).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('restores the row when another device edited it after this device deleted it', () => {
    const result = reconcileActivities({
      local: [],
      server: [activity('a', { updatedAt: LATER })],
      pending: pending({ a: { editedAt: EARLIER, removes: true } }),
    })

    expect(result.activities.map((a) => a.id)).toEqual(['a'])
    expect(result.conflicts).toEqual([
      { activityId: 'a', serverUpdatedAt: LATER, localSnapshot: null },
    ])
  })

  it('keeps a locally-edited row that is missing server-side, letting the queue decide', () => {
    // Deleted on another device while an edit of ours was still queued. The
    // queued write will come back as not_found and be recorded as a rejected
    // conflict — until then, dropping it on sight would make it flicker.
    const result = reconcileActivities({
      local: [activity('a', { durationMinutes: 90 })],
      server: [],
      pending: pending({ a: { editedAt: LATER } }),
    })

    expect(result.activities.map((a) => a.id)).toEqual(['a'])
    expect(result.changed).toBe(false)
  })
})

describe('reconcileActivities — degenerate inputs', () => {
  it('handles both sides empty', () => {
    const result = reconcileActivities({ local: [], server: [], pending: new Map() })
    expect(result).toEqual({ activities: [], conflicts: [], changed: false })
  })

  it('orders the result deterministically by start time', () => {
    const result = reconcileActivities({
      local: [],
      server: [
        activity('late', { startMinutes: 900, updatedAt: EARLIER }),
        activity('early', { startMinutes: 60, updatedAt: EARLIER }),
      ],
      pending: new Map(),
    })
    expect(result.activities.map((a) => a.id)).toEqual(['early', 'late'])
  })

  it('does not treat a pure reordering of identical activities as a change', () => {
    const local = [activity('a', { startMinutes: 900 }), activity('b', { startMinutes: 60 })]
    const result = reconcileActivities({
      local,
      server: [
        activity('b', { startMinutes: 60, updatedAt: EARLIER }),
        activity('a', { startMinutes: 900, updatedAt: EARLIER }),
      ],
      pending: new Map(),
    })
    expect(result.changed).toBe(false)
  })
})
