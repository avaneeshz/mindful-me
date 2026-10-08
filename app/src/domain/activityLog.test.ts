import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_LOG_MAX_ENTRIES,
  ACTIVITY_LOG_RETENTION_MS,
  describeSupabasePath,
  filterEntries,
  formatDetail,
  groupByDay,
  pruneEntries,
  shortLabel,
  truncateText,
  type ActivityLogEntry,
} from './activityLog'

const NOW = Date.UTC(2026, 9, 8, 12)
function entry(at: number, extra: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return { id: String(at), userId: 'u', at, kind: 'tap', level: 'info', summary: 's', ...extra }
}

describe('pruneEntries', () => {
  it('drops entries older than three days and keeps the rest oldest-first', () => {
    const fresh = entry(NOW - 1000)
    const edge = entry(NOW - ACTIVITY_LOG_RETENTION_MS)
    const stale = entry(NOW - ACTIVITY_LOG_RETENTION_MS - 1)
    expect(pruneEntries([fresh, stale, edge], NOW)).toEqual([edge, fresh])
  })

  it('caps the count, dropping the oldest first', () => {
    const many = Array.from({ length: ACTIVITY_LOG_MAX_ENTRIES + 3 }, (_, i) => entry(NOW - 100_000 + i))
    const kept = pruneEntries(many, NOW)
    expect(kept).toHaveLength(ACTIVITY_LOG_MAX_ENTRIES)
    expect(kept[0].at).toBe(NOW - 100_000 + 3)
  })
})

describe('formatDetail', () => {
  it('keeps full note text and pretty-prints objects', () => {
    expect(formatDetail('a long note')).toBe('a long note')
    expect(formatDetail({ note: 'hi' })).toBe('{\n  "note": "hi"\n}')
    expect(formatDetail(undefined)).toBeUndefined()
  })

  it('truncates only past the ceiling, and says so', () => {
    expect(truncateText('abcdef', 3)).toContain('3 more characters')
    expect(truncateText('abc', 3)).toBe('abc')
  })
})

describe('shortLabel', () => {
  it('flattens whitespace and shortens', () => {
    expect(shortLabel('  Save \n  note ')).toBe('Save note')
    expect(shortLabel('x'.repeat(100), 10)).toHaveLength(10)
  })
})

describe('describeSupabasePath', () => {
  it('never logs auth traffic', () => {
    expect(describeSupabasePath('/auth/v1/token')).toBeNull()
  })
  it('marks edge functions sensitive', () => {
    expect(describeSupabasePath('/functions/v1/health-callback')).toEqual({ label: 'function/health-callback', sensitive: true })
  })
  it('names rpc and table calls', () => {
    expect(describeSupabasePath('/rest/v1/rpc/create_note_entry_v2')?.label).toBe('rpc/create_note_entry_v2')
    expect(describeSupabasePath('/rest/v1/activities')?.label).toBe('activities')
  })
})

describe('filter and grouping', () => {
  it('filters to problems', () => {
    const list = [entry(2, { level: 'error' }), entry(1)]
    expect(filterEntries(list, 'problems')).toHaveLength(1)
    expect(filterEntries(list, 'all')).toHaveLength(2)
  })
  it('groups consecutive entries by day', () => {
    const day = 24 * 60 * 60 * 1000
    const groups = groupByDay([entry(NOW), entry(NOW - 1000), entry(NOW - 2 * day)])
    expect(groups.map((g) => g.entries.length)).toEqual([2, 1])
  })
})
