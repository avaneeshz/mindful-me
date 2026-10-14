import { afterEach, describe, expect, it, vi } from 'vitest'
import { withSyncLock } from './syncLock'

afterEach(() => vi.unstubAllGlobals())

describe('withSyncLock', () => {
  it('just runs where the Web Locks API is missing', async () => {
    vi.stubGlobal('navigator', {})
    const run = vi.fn(async () => {})
    expect(await withSyncLock(run)).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs when it gets the lock', async () => {
    vi.stubGlobal('navigator', { locks: { request: (_n: string, _o: unknown, cb: (l: object | null) => Promise<boolean>) => cb({}) } })
    const run = vi.fn(async () => {})
    expect(await withSyncLock(run)).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does NOT run when another tab already holds the lock', async () => {
    vi.stubGlobal('navigator', { locks: { request: (_n: string, _o: unknown, cb: (l: object | null) => Promise<boolean>) => cb(null) } })
    const run = vi.fn(async () => {})
    expect(await withSyncLock(run)).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
})
