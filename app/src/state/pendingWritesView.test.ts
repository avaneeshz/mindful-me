import { describe, expect, it } from 'vitest'
import { describePendingWrite, pendingWriteRows } from './pendingWritesView'
import { makeOneDue, type PendingWrite } from './pendingWritesQueue'

function write(extra: Partial<PendingWrite> = {}): PendingWrite {
  return {
    id: 'w', userId: 'u', action: 'note.create', entity: 'note', recordId: 'n', op: 'save', args: ['mirror', 'the full text'], label: 'Add note',
    createdAt: 1, attempts: 0, status: 'pending', lastError: null, permanent: false, nextAttemptAt: 0, ...extra,
  }
}

describe('describePendingWrite', () => {
  it('says a fresh change is being sent', () => {
    expect(describePendingWrite(write(), 0).state).toBe('sending')
  })
  it('says a failing change is retrying, and when', () => {
    const row = describePendingWrite(write({ attempts: 2, status: 'failed', nextAttemptAt: 60_000 }), 0)
    expect(row.state).toBe('retrying')
    expect(row.reason).toContain('tried 2 times')
    expect(row.reason).toContain('1 minute')
  })
  it('says a refused change needs a decision', () => {
    const row = describePendingWrite(write({ permanent: true, attempts: 1, status: 'failed' }), 0)
    expect(row.state).toBe('rejected')
    expect(row.reason).toContain('refused')
  })
  it('keeps the full content for the user to read', () => {
    expect(describePendingWrite(write(), 0).detail).toContain('the full text')
  })
})

describe('pendingWriteRows', () => {
  it('puts refused changes first, then oldest first', () => {
    const rows = pendingWriteRows(
      [write({ id: 'a', createdAt: 1 }), write({ id: 'b', createdAt: 2, permanent: true, status: 'failed', attempts: 1 }), write({ id: 'c', createdAt: 0 })],
      0,
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('makeOneDue', () => {
  it('revives only the chosen entry', () => {
    const q = makeOneDue([write({ id: 'a', permanent: true, nextAttemptAt: 99 }), write({ id: 'b', nextAttemptAt: 99 })], 'a', 5)
    expect(q[0]).toMatchObject({ permanent: false, nextAttemptAt: 5 })
    expect(q[1].nextAttemptAt).toBe(99)
  })
})
