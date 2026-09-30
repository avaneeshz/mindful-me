import { describe, expect, it } from 'vitest'
import { AUTO_SYNC_INTERVAL_MS, AUTO_SYNC_MAX_BACKOFF_MS, isAutoSyncDue, nextAutoSyncDelay } from './healthAutoSync'

const NOW = Date.parse('2026-09-30T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('isAutoSyncDue', () => {
  it('is due when it has never synced', () => {
    expect(isAutoSyncDue(null, NOW)).toBe(true)
  })
  it('waits the full interval after a sync', () => {
    expect(isAutoSyncDue(ago(2 * 60_000), NOW)).toBe(false)
    expect(isAutoSyncDue(ago(AUTO_SYNC_INTERVAL_MS), NOW)).toBe(true)
  })
  it('treats an unreadable timestamp as due', () => {
    expect(isAutoSyncDue('nope', NOW)).toBe(true)
  })
})

describe('nextAutoSyncDelay', () => {
  it('waits out the rest of the interval after a recent sync', () => {
    expect(AUTO_SYNC_INTERVAL_MS).toBe(5 * 60_000)
    expect(nextAutoSyncDelay(ago(2 * 60_000), NOW, 0)).toBe(3 * 60_000)
  })
  it('never schedules sooner than a minute, even when overdue or skewed', () => {
    expect(nextAutoSyncDelay(ago(AUTO_SYNC_INTERVAL_MS * 3), NOW, 0)).toBe(60_000)
  })
  it('never waits longer than one interval after a success', () => {
    expect(nextAutoSyncDelay(new Date(NOW + 60 * 60_000).toISOString(), NOW, 0)).toBe(AUTO_SYNC_INTERVAL_MS)
  })
  it('backs off exponentially after failures, capped', () => {
    expect(nextAutoSyncDelay(null, NOW, 1)).toBe(AUTO_SYNC_INTERVAL_MS * 2)
    expect(nextAutoSyncDelay(null, NOW, 2)).toBe(AUTO_SYNC_INTERVAL_MS * 4)
    expect(nextAutoSyncDelay(null, NOW, 10)).toBe(AUTO_SYNC_MAX_BACKOFF_MS)
  })
})
