import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_QUEUE, type QueueEntry, type SyncQueue } from './syncQueue'
import { loadSyncQueue, queueStorageKey, saveSyncQueue } from './syncQueueStorage'

/** A minimal, controllable localStorage — the suite runs with no DOM. */
class MemoryStorage {
  map = new Map<string, string>()
  failOnWrite = false

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new DOMException('QuotaExceededError')
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('window', { localStorage: storage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function entry(entryId: string): QueueEntry {
  return {
    entryId,
    intent: { kind: 'delete', id: 'a' },
    dayISO: '2026-08-27',
    editedAt: '2026-08-27T10:00:00.000Z',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
  }
}

function queueOf(...entries: QueueEntry[]): SyncQueue {
  return { entries }
}

describe('loadSyncQueue / saveSyncQueue', () => {
  it('round-trips a queue', () => {
    saveSyncQueue('user-1', queueOf(entry('e1'), entry('e2')))
    expect(loadSyncQueue('user-1').entries.map((e) => e.entryId)).toEqual(['e1', 'e2'])
  })

  it('returns an empty queue when nothing was ever stored', () => {
    expect(loadSyncQueue('user-1')).toEqual(EMPTY_QUEUE)
    expect(loadSyncQueue(null)).toEqual(EMPTY_QUEUE)
  })

  it('namespaces per user — one account never inherits another’s unsent writes', () => {
    saveSyncQueue('user-1', queueOf(entry('mine')))
    expect(loadSyncQueue('user-2').entries).toEqual([])
    expect(queueStorageKey('user-1')).not.toBe(queueStorageKey('user-2'))
    expect(queueStorageKey(null)).toBe(queueStorageKey(null))
  })

  it('clears the stored key entirely once the queue drains', () => {
    saveSyncQueue('user-1', queueOf(entry('e1')))
    saveSyncQueue('user-1', EMPTY_QUEUE)
    expect(storage.getItem(queueStorageKey('user-1'))).toBeNull()
  })

  it('discards a stored queue written by an incompatible version', () => {
    storage.setItem(
      queueStorageKey('user-1'),
      JSON.stringify({ version: 999, entries: [entry('e1')] }),
    )
    expect(loadSyncQueue('user-1').entries).toEqual([])
  })

  it('survives corrupt JSON, a wrong shape, and a malformed entry', () => {
    storage.setItem(queueStorageKey('user-1'), '{not json')
    expect(loadSyncQueue('user-1').entries).toEqual([])

    storage.setItem(queueStorageKey('user-1'), JSON.stringify([1, 2, 3]))
    expect(loadSyncQueue('user-1').entries).toEqual([])

    storage.setItem(
      queueStorageKey('user-1'),
      JSON.stringify({ version: 1, entries: [entry('good'), { entryId: 'bad' }] }),
    )
    expect(loadSyncQueue('user-1').entries.map((e) => e.entryId)).toEqual(['good'])
  })

  it('fails closed when storage is unavailable, rather than crashing the app', () => {
    storage.failOnWrite = true
    expect(() => saveSyncQueue('user-1', queueOf(entry('e1')))).not.toThrow()

    vi.stubGlobal('window', undefined)
    expect(loadSyncQueue('user-1')).toEqual(EMPTY_QUEUE)
    expect(() => saveSyncQueue('user-1', queueOf(entry('e1')))).not.toThrow()
  })
})
