import { describe, expect, it } from 'vitest'
import {
  addWrite,
  amendWrite,
  makeAllDue,
  markWriteFailed,
  markWritePermanent,
  nextDueWrite,
  pendingIds,
  removeWrite,
  type PendingWrite,
} from './pendingWritesQueue'

function write(extra: Partial<PendingWrite> = {}): PendingWrite {
  return {
    id: 'w1', userId: 'u', action: 'tile.update', entity: 'tile', recordId: 'r1', op: 'save', args: [], label: 'l',
    createdAt: 1, attempts: 0, status: 'pending', lastError: null, permanent: false, nextAttemptAt: 0, ...extra,
  }
}
const none = new Set<string>()

describe('pending writes ledger', () => {
  it('never expires: an entry from long ago is still due, and still protects its row', () => {
    const q = addWrite([], write({ createdAt: 1, nextAttemptAt: 1 }))
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    expect(nextDueWrite(q, 'u', thirtyDays, none)?.id).toBe('w1')
    expect(pendingIds(q, 'u', 'tile', 'save').has('r1')).toBe(true)
  })

  it('replays oldest first, and never a later change to a record before an earlier one', () => {
    let q = addWrite([], write({ id: 'a', createdAt: 1 }))
    q = addWrite(q, write({ id: 'b', createdAt: 2 }))
    q = markWriteFailed(q, 'a', 'down', 10) // a backs off
    // b is the same record and must not jump ahead of a
    expect(nextDueWrite(q, 'u', 11, none)).toBeNull()
    expect(nextDueWrite(q, 'u', 10 + 60 * 60 * 1000, none)?.id).toBe('a')
  })

  it('lets other records proceed while one is backing off', () => {
    let q = addWrite([], write({ id: 'a', recordId: 'r1', createdAt: 1 }))
    q = addWrite(q, write({ id: 'b', recordId: 'r2', createdAt: 2 }))
    q = markWriteFailed(q, 'a', 'down', 10)
    expect(nextDueWrite(q, 'u', 11, none)?.id).toBe('b')
  })

  it('only ever replays the signed-in user’s own changes, and keeps everyone else’s', () => {
    const q = addWrite([], write({ userId: 'other' }))
    expect(nextDueWrite(q, 'u', 1, none)).toBeNull()
    expect(q).toHaveLength(1)
  })

  it('skips an entry already in flight', () => {
    expect(nextDueWrite([write()], 'u', 1, new Set(['w1']))).toBeNull()
  })

  it('keeps a permanently rejected entry, stops retrying it, and retry-now revives it', () => {
    let q = markWritePermanent([write()], 'w1', 'duplicate')
    expect(nextDueWrite(q, 'u', Number.MAX_SAFE_INTEGER - 1, none)).toBeNull()
    expect(q[0].status).toBe('failed')
    q = makeAllDue(q, 'u', 5)
    expect(nextDueWrite(q, 'u', 5, none)?.id).toBe('w1')
  })

  it('a permanently rejected change does not block later changes to the same record', () => {
    let q = addWrite([], write({ id: 'a', createdAt: 1 }))
    q = addWrite(q, write({ id: 'b', createdAt: 2 }))
    q = markWritePermanent(q, 'a', 'duplicate')
    expect(nextDueWrite(q, 'u', 5, none)?.id).toBe('b')
  })

  it('amend and remove', () => {
    let q = amendWrite([write()], 'w1', { args: ['x'] })
    expect(q[0].args).toEqual(['x'])
    q = removeWrite(q, 'w1')
    expect(q).toEqual([])
  })
})
