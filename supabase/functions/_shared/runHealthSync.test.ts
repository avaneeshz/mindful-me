import { afterEach, describe, expect, it, vi } from 'vitest'
import { runHealthSync } from './runHealthSync.ts'
import { ALL_HEALTH_SCOPES } from './googleHealth.ts'

/**
 * Runs the real sync against a fake Google that returns realistic volumes —
 * heart rate every 5 seconds, per-minute energy points, ECG waveforms — and
 * checks each step stays well inside the function's ~2s CPU budget. This is
 * the failure that reached production (`CPU Time exceeded`), so it is tested
 * at production-like scale rather than with a handful of points.
 */

const HR_INTERVAL_MS = 5_000
const WAVEFORM_SAMPLES = 15_000

function filterRange(filter: string): { start: number; end: number } {
  const times = [...filter.matchAll(/"([^"]+)"/g)].map((m) => Date.parse(m[1].length === 10 ? `${m[1]}T00:00:00Z` : m[1]))
  return { start: times[0], end: times[1] ?? Date.now() }
}

function page<T>(all: T[], url: URL): { dataPoints: T[]; nextPageToken?: string } {
  const size = Number(url.searchParams.get('pageSize') ?? 100)
  const offset = Number(url.searchParams.get('pageToken') ?? 0)
  const slice = all.slice(offset, offset + size)
  return offset + size < all.length ? { dataPoints: slice, nextPageToken: String(offset + size) } : { dataPoints: slice }
}

function fakeGoogle(input: string | URL): unknown {
  const url = new URL(String(input))
  const path = url.pathname
  if (path.endsWith('/users/me/settings')) return { timeZone: 'Asia/Kolkata' }
  if (path.endsWith('/users/me/profile')) return { age: 30 }
  if (path.endsWith(':dailyRollUp')) return { rollupDataPoints: [] }
  const type = path.split('/dataTypes/')[1]?.split('/')[0]
  const { start, end } = filterRange(url.searchParams.get('filter') ?? '')
  if (type === 'heart-rate') {
    const all = []
    for (let t = start; t < end; t += HR_INTERVAL_MS) {
      all.push({ heartRate: { beatsPerMinute: String(60 + ((t / 1000) % 40)), sampleTime: { physicalTime: new Date(t).toISOString() } } })
    }
    return page(all, url)
  }
  if (type === 'active-energy-burned' || type === 'basal-energy-burned') {
    const field = type === 'active-energy-burned' ? 'activeEnergyBurned' : 'basalEnergyBurned'
    const all = []
    for (let t = start; t < end; t += 60_000) {
      all.push({ [field]: { kcal: 1.2, interval: { startTime: new Date(t).toISOString(), endTime: new Date(t + 60_000).toISOString() } } })
    }
    return page(all, url)
  }
  if (type === 'electrocardiogram') {
    const all = Array.from({ length: 30 }, (_, i) => ({
      electrocardiogram: {
        beatsPerMinuteAvg: 70,
        interval: { startTime: new Date(end - i * 86_400_000).toISOString() },
        waveformSamples: Array.from({ length: WAVEFORM_SAMPLES }, (_, j) => Math.sin(j)),
      },
    }))
    return page(all, url)
  }
  return { dataPoints: [] }
}

function fakeAdmin() {
  const state = { sync_state: {} as Record<string, unknown>, upserted: 0 }
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_external_connection_for_sync') {
        return {
          data: [{
            id: 'c1',
            access_token: 'tok',
            refresh_token: 'r',
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            scopes: ALL_HEALTH_SCOPES,
            sync_state: structuredClone(state.sync_state),
          }],
          error: null,
        }
      }
      if (name === 'upsert_health_metrics') {
        state.upserted += (args.p_rows as unknown[]).length
        return { data: null, error: null }
      }
      if (name === 'mark_external_connection_synced') {
        if (args.p_sync_state) state.sync_state = structuredClone(args.p_sync_state as Record<string, unknown>)
        return { data: null, error: null }
      }
      return { data: null, error: null }
    },
  }
  return { admin: admin as never, state }
}

async function runWholeSync(admin: never) {
  const cpuPerStep: number[] = []
  let step = 0
  let steps = 0
  for (;;) {
    const before = process.cpuUsage()
    const result = await runHealthSync(admin, 'u1', 'id', 'secret', 'google_health', step)
    const used = process.cpuUsage(before)
    cpuPerStep.push((used.user + used.system) / 1000)
    steps++
    expect(result.ok).toBe(true)
    if (result.nextStep === null || result.nextStep === undefined) return { cpuPerStep, steps, total: result.totalSteps }
    expect(result.nextStep).toBeGreaterThan(step)
    step = result.nextStep
    expect(steps).toBeLessThan(60)
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('runHealthSync in steps', () => {
  it('finishes a first sync in bounded steps, each well under the CPU budget', async () => {
    vi.stubGlobal('fetch', async (input: string | URL) => new Response(JSON.stringify(fakeGoogle(input)), { status: 200 }))
    const { admin, state } = fakeAdmin()
    const { cpuPerStep, steps } = await runWholeSync(admin)

    // Node here is not the edge runtime, so leave generous headroom under 2,000 ms.
    expect(Math.max(...cpuPerStep)).toBeLessThan(600)
    expect(state.upserted).toBeGreaterThan(0)
    // Every past heart-rate day was fetched once and remembered.
    expect((state.sync_state['heart-rate-intraday'] as { doneDays: string[] }).doneDays.length).toBe(28)
  }, 120_000)

  it('makes a repeat sync cheaper: finished heart-rate days are not fetched again', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL) => {
      calls.push(String(input))
      return new Response(JSON.stringify(fakeGoogle(input)), { status: 200 })
    })
    const { admin } = fakeAdmin()
    await runWholeSync(admin)
    const firstHr = calls.filter((c) => c.includes('/heart-rate/dataPoints?')).length
    calls.length = 0
    await runWholeSync(admin)
    const secondHr = calls.filter((c) => c.includes('/heart-rate/dataPoints?')).length
    expect(secondHr).toBeLessThan(firstHr)
  }, 120_000)
})

describe('runHealthSync modes', () => {
  function stubGoogle() {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL) => {
      calls.push(String(input))
      return new Response(JSON.stringify(fakeGoogle(input)), { status: 200 })
    })
    return calls
  }

  it("a full sync fetches today's heart rate in its very first call", async () => {
    const calls = stubGoogle()
    const { admin } = fakeAdmin()
    const result = await runHealthSync(admin, 'u1', 'id', 'secret', 'google_health', 0, 'full')
    expect(result.ok).toBe(true)
    expect(result.nextStep).toBeGreaterThan(0)
    // Today in the account's zone (Asia/Kolkata) starts at the previous UTC day's 18:30.
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const [y, m, d] = todayKey.split('-').map(Number)
    const todayStart = new Date(Date.UTC(y, m - 1, d) - 5.5 * 3600_000).toISOString()
    const hr = calls.filter((c) => c.includes('/heart-rate/dataPoints?'))
    expect(hr.some((c) => decodeURIComponent(new URL(c).searchParams.get('filter') ?? '').includes(todayStart))).toBe(true)
  })

  it('a quick sync is one call, a handful of reads, and well under the CPU budget', async () => {
    const calls = stubGoogle()
    const { admin, state } = fakeAdmin()
    const before = process.cpuUsage()
    const result = await runHealthSync(admin, 'u1', 'id', 'secret', 'google_health', 0, 'quick')
    const used = process.cpuUsage(before)
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('quick')
    expect(result.nextStep).toBeNull()
    // settings (time zone) + steps, heart-rate, active energy + today's heart rate
    // (a reading every 5 s can take two pages)
    expect(calls.length).toBeLessThanOrEqual(6)
    expect(calls.some((c) => c.includes('/sleep/') || c.includes('/exercise/'))).toBe(false)
    expect((used.user + used.system) / 1000).toBeLessThan(600)
    expect(state.upserted).toBeGreaterThan(0)
    // A quick sync never claims a full one happened.
    expect(state.sync_state.__lastFullSyncAt).toBeUndefined()
  })

  it('auto runs a full sync first, then quick ones until the full sync is 6 hours old', async () => {
    stubGoogle()
    const { admin, state } = fakeAdmin()

    const first = await runHealthSync(admin, 'u1', 'id', 'secret', 'google_health', 0, 'auto')
    expect(first.mode).toBe('full')
    // The caller continues a full sync with mode 'full' until it finishes.
    let next = first.nextStep
    while (typeof next === 'number') next = (await runHealthSync(admin, 'u1', 'id', 'secret', 'google_health', next, 'full')).nextStep
    expect(typeof state.sync_state.__lastFullSyncAt).toBe('string')

    const second = await runHealthSync(admin, 'u1', 'id', 'secret', 'google_health', 0, 'auto')
    expect(second.mode).toBe('quick')

    state.sync_state.__lastFullSyncAt = new Date(Date.now() - 7 * 3600_000).toISOString()
    const third = await runHealthSync(admin, 'u1', 'id', 'secret', 'google_health', 0, 'auto')
    expect(third.mode).toBe('full')
  }, 120_000)
})
