import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const conn = vi.hoisted(() => ({
  state: {
    configured: true,
    status: null as null | { status: string; lastSyncedAt: string | null; lastError: string | null },
    statusLoading: false,
    summaries: [] as Array<{ dataType: string; latestRecordedAt: string | null; pointCountRecent: number }>,
    summariesLoading: false,
    syncing: false,
    syncMessage: null,
    syncProgress: null as null | { done: number; total: number },
    syncNow: () => {},
  },
  hr: null as null | Array<{ key: string; label: string; data: { points: Array<[number, number]>; min: number; max: number; avg: number; count: number } }>,
}))
vi.mock('@/state/useHealthConnection', () => ({ useHealthConnection: () => conn.state }))
vi.mock('@/state/useHealthMetrics', () => ({
  useHealthMetrics: () => [{ id: 'p1', recordedAt: '2026-09-29T00:00:00Z', endAt: null, value: { timeZone: 'Asia/Kolkata' }, unit: null, source: null }],
  useHeartRateDays: () => conn.hr,
}))

import { HealthDataScreen } from './health-data'

const noop = () => {}
const render = () => renderToStaticMarkup(<HealthDataScreen onBack={noop} />)

describe('Lumen Health data', () => {
  it('explains local-only mode', () => {
    conn.state.configured = false
    expect(render()).toContain('not signed in')
    conn.state.configured = true
  })

  it('points to Devices & apps when nothing is connected', () => {
    conn.state.status = null
    expect(render()).toContain('No device connected')
  })

  it('shows the heart-rate day with its low, average and high', () => {
    conn.state.status = { status: 'connected', lastSyncedAt: '2026-09-29T10:00:00Z', lastError: null }
    conn.hr = [{ key: '2026-09-29', label: 'Tue, Sep 29', data: { points: [[0, 60], [1, 90]], min: 58, max: 131, avg: 74, count: 900 } }]
    const html = render()
    expect(html).toContain('Tue, Sep 29')
    expect(html).toContain('>58<')
    expect(html).toContain('>131<')
    expect(html).toContain('Sync now')
  })

  it('lays out one section per permission group, with each synced type in its group', () => {
    conn.state.summaries = [
      { dataType: 'steps', latestRecordedAt: null, pointCountRecent: 5 },
      { dataType: 'moods', latestRecordedAt: null, pointCountRecent: 1 },
      { dataType: 'settings', latestRecordedAt: null, pointCountRecent: 1 },
      { dataType: 'heart-rate-intraday', latestRecordedAt: null, pointCountRecent: 14 },
    ]
    const html = render()
    for (const g of ['Activity &amp; fitness', 'Body &amp; vitals', 'Mindfulness', 'Reproductive health', 'Settings']) expect(html).toContain(g)
    expect(html).toContain('Steps')
    expect(html).toContain('Moods')
    // The settings snapshot shows as details, not a chart.
    expect(html).toContain('Asia/Kolkata')
    // The full-day heart rate has its own card, not a row of its own.
    expect(html).not.toContain('Heart rate through the day</span>')
    // Empty groups say so.
    expect(html).toContain('Nothing from your device yet')
  })

  it('shows sync progress', () => {
    conn.state.syncProgress = { done: 4, total: 22 }
    expect(render()).toContain('Syncing… 4 of 22')
    conn.state.syncProgress = null
  })
})
