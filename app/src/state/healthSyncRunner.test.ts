import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  calls: [] as Array<{ step: number; mode: string }>,
  // Each queued response resolves one call; tests release them in order.
  pending: [] as Array<(r: unknown) => void>,
}))
vi.mock('@/api/healthSync', () => ({
  apiTriggerHealthSync: (step: number, mode: string) => {
    api.calls.push({ step, mode })
    return new Promise((resolve) => api.pending.push(resolve))
  },
}))

import { isHealthSyncRunning, onHealthSyncFinished, runHealthSync } from './healthSyncRunner'

const flush = () => new Promise((r) => setTimeout(r, 0))
async function release(result: unknown) {
  await flush()
  api.pending.shift()!(result)
  await flush()
}

beforeEach(() => {
  api.calls.length = 0
  api.pending.length = 0
})

describe('healthSyncRunner', () => {
  it('loops through steps, continuing with the mode the server settled on', async () => {
    const done = runHealthSync('auto')
    await release({ ok: true, nextStep: 3, totalSteps: 6, mode: 'full', pointsSynced: 10 })
    await release({ ok: true, nextStep: null, totalSteps: 6, mode: 'full', pointsSynced: 5 })
    expect(await done).toEqual({ ok: true, reason: undefined, message: undefined, points: 15 })
    expect(api.calls).toEqual([
      { step: 0, mode: 'auto' },
      { step: 3, mode: 'full' },
    ])
    expect(isHealthSyncRunning()).toBe(false)
  })

  it('joins a sync already in flight instead of starting a second', async () => {
    const a = runHealthSync('quick')
    const b = runHealthSync('auto')
    expect(b).toBe(a)
    await release({ ok: true, nextStep: null, mode: 'quick', pointsSynced: 2 })
    await a
    expect(api.calls).toHaveLength(1)
  })

  it('runs a full sync after a lighter one in flight, never alongside it', async () => {
    const quick = runHealthSync('quick')
    const full = runHealthSync('full')
    await release({ ok: true, nextStep: null, mode: 'quick', pointsSynced: 1 })
    await quick
    await release({ ok: true, nextStep: null, mode: 'full', pointsSynced: 9 })
    expect((await full).points).toBe(9)
    expect(api.calls.map((c) => c.mode)).toEqual(['quick', 'full'])
  })

  it('tells every listener how each sync ended, including failures', async () => {
    const heard: unknown[] = []
    const off = onHealthSyncFinished((o) => heard.push(o))
    const run = runHealthSync('auto')
    await release({ ok: false, reason: 'sync_error', message: 'boom' })
    await run
    off()
    expect(heard).toEqual([{ ok: false, reason: 'sync_error', message: 'boom', points: 0 }])
  })
})
