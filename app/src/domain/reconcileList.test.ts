import { describe, expect, it } from 'vitest'
import { reconcileList } from './reconcileList'

interface Row {
  id: string
  v: string
}
const id = (r: Row) => r.id
const none = new Set<string>()

describe('reconcileList', () => {
  it('trusts the server for rows with nothing pending (other-device edits and deletes show up)', () => {
    const merged = reconcileList([{ id: 'a', v: 'old' }, { id: 'gone', v: 'x' }], [{ id: 'a', v: 'new' }], none, none, id)
    expect(merged).toEqual([{ id: 'a', v: 'new' }])
  })

  it('keeps the local copy of a row with an unconfirmed edit', () => {
    const merged = reconcileList([{ id: 'a', v: 'mine' }], [{ id: 'a', v: 'stale' }], new Set(['a']), none, id)
    expect(merged).toEqual([{ id: 'a', v: 'mine' }])
  })

  it('keeps a pending row the server has never seen — the lost-write case', () => {
    const merged = reconcileList([{ id: 'new', v: 'unsynced note' }], [{ id: 'a', v: 's' }], new Set(['new']), none, id)
    expect(merged).toEqual([{ id: 'a', v: 's' }, { id: 'new', v: 'unsynced note' }])
  })

  it('does not resurrect a row with an unconfirmed delete', () => {
    const merged = reconcileList([], [{ id: 'a', v: 's' }], none, new Set(['a']), id)
    expect(merged).toEqual([])
  })
})
