import { beforeEach, describe, expect, it } from 'vitest'
import { getActivityLogSnapshot, resetActivityLogForTests, setActivityLogUser } from '@/lib/activityLogger'
import {
  amendPendingWrite,
  cancelPendingWrite,
  getPendingIds,
  getPendingWritesSnapshot,
  resetPendingWritesForTests,
  setPendingWritesUser,
  writeThrough,
} from './pendingWrites'

// The project's tests run in Node (no DOM): give device storage a tiny in-memory stand-in.
const store = new Map<string, string>()
;(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
}

// In tests there is no Supabase client, so every send fails like an unreachable server.
describe('pending writes service', () => {
  beforeEach(() => {
    store.clear()
    resetPendingWritesForTests()
    resetActivityLogForTests()
    setActivityLogUser('u')
    setPendingWritesUser('u')
  })

  it('keeps a change the server did not confirm, protects its row, and logs it', async () => {
    const out = await writeThrough({
      action: 'note.create', entity: 'note', recordId: 'n1', op: 'save', args: ['mirror', 'my full note', []], label: 'Add note on “Relational Nutrient”',
    })
    expect(out.status).toBe('queued')
    expect(getPendingWritesSnapshot()).toHaveLength(1)
    expect(getPendingWritesSnapshot()[0].status).toBe('failed')
    expect(getPendingIds('note').save.has('n1')).toBe(true)
    const log = getActivityLogSnapshot().map((e) => e.summary).join('\n')
    expect(log).toContain('Saved on device: Add note')
    expect(log).toContain('Not synced')
    expect(getActivityLogSnapshot().some((e) => e.detail?.includes('my full note'))).toBe(true)
  })

  it('survives a reload (module restart) and a sign-out / sign-in, and is not replayed into another account', async () => {
    await writeThrough({ action: 'tile.update', entity: 'tile', recordId: 't1', op: 'save', args: ['t1', 'Work', 'briefcase'], label: 'Rename tile' })
    resetPendingWritesForTests() // a reload: memory gone, device storage stays
    setPendingWritesUser('u')
    expect(getPendingWritesSnapshot()).toHaveLength(1)
    setPendingWritesUser('someone-else')
    expect(getPendingWritesSnapshot()).toHaveLength(0)
    setPendingWritesUser(null)
    setPendingWritesUser('u')
    expect(getPendingWritesSnapshot()).toHaveLength(1)
  })

  it('queues a second change to the same record behind the first instead of overtaking it', async () => {
    await writeThrough({ action: 'tile.update', entity: 'tile', recordId: 't1', op: 'save', args: ['t1', 'A', 'x'], label: 'one' })
    const second = await writeThrough({ action: 'tile.setHidden', entity: 'tile', recordId: 't1', op: 'save', args: ['t1', true], label: 'two' })
    expect(second.status).toBe('queued')
    expect(getPendingWritesSnapshot().map((w) => w.label)).toEqual(['one', 'two'])
  })

  it('coalesces repeated "set" writes to one record', async () => {
    const spec = { action: 'dailyValue.set', entity: 'dailyValue', recordId: 'steps:2026-10-08', op: 'save' as const, label: 'Steps' }
    await writeThrough({ ...spec, args: ['steps', '2026-10-08', 1], coalesce: true })
    await writeThrough({ ...spec, args: ['steps', '2026-10-08', 2], coalesce: true })
    expect(getPendingWritesSnapshot()).toHaveLength(1)
    expect(getPendingWritesSnapshot()[0].args).toEqual(['steps', '2026-10-08', 2])
  })

  it('amends or cancels an unsent create', async () => {
    await writeThrough({ action: 'note.create', entity: 'note', recordId: 'n1', op: 'save', args: ['mirror', 'v1', []], label: 'Add note' })
    expect(amendPendingWrite('note', 'n1', 'note.create', { args: ['mirror', 'v2', []], label: 'Add note' })).toBe(true)
    expect(getPendingWritesSnapshot()[0].args).toEqual(['mirror', 'v2', []])
    expect(cancelPendingWrite('note', 'n1', 'note.create', 'Delete note')).toBe(true)
    expect(getPendingWritesSnapshot()).toHaveLength(0)
  })
})
