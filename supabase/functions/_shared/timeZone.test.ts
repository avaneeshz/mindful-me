import { describe, expect, it } from 'vitest'
import { localDateKey, localMidnightUtc, nextDayKey, recentLocalDays, safeTimeZone, tzOffsetMs } from './timeZone.ts'

describe('timeZone', () => {
  it('falls back to UTC for a missing or invalid zone', () => {
    expect(safeTimeZone(null)).toBe('UTC')
    expect(safeTimeZone('Not/AZone')).toBe('UTC')
    expect(safeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
  })

  it('knows India is 5h30 ahead of UTC', () => {
    expect(tzOffsetMs(Date.UTC(2026, 8, 30, 12), 'Asia/Kolkata')).toBe(5.5 * 3600_000)
  })

  it('starts an Indian local day at 18:30 UTC the evening before', () => {
    const start = localMidnightUtc({ year: 2026, month: 9, day: 30 }, 'Asia/Kolkata')
    expect(new Date(start).toISOString()).toBe('2026-09-29T18:30:00.000Z')
  })

  it('assigns instants to the local calendar day, not the UTC one', () => {
    // 20:00 UTC on the 29th is already 01:30 on the 30th in India.
    expect(localDateKey(Date.UTC(2026, 8, 29, 20), 'Asia/Kolkata')).toBe('2026-09-30')
    expect(localDateKey(Date.UTC(2026, 8, 29, 20), 'UTC')).toBe('2026-09-29')
  })

  it('handles a day whose length changes with daylight saving', () => {
    // US clocks go forward on 2026-03-08: that local day is 23 hours long.
    const start = localMidnightUtc({ year: 2026, month: 3, day: 8 }, 'America/New_York')
    const end = localMidnightUtc({ year: 2026, month: 3, day: 9 }, 'America/New_York')
    expect((end - start) / 3600_000).toBe(23)
  })

  it('rolls month and year boundaries', () => {
    expect(nextDayKey('2026-09-30')).toBe('2026-10-01')
    expect(nextDayKey('2026-12-31')).toBe('2027-01-01')
  })

  it('lists recent local days oldest first, each ending where the next begins', () => {
    const days = recentLocalDays(Date.UTC(2026, 8, 30, 3), 3, 'Asia/Kolkata')
    expect(days.map((d) => d.key)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
    expect(days[0].endMs).toBe(days[1].startMs)
    expect(days[1].endMs).toBe(days[2].startMs)
  })
})
