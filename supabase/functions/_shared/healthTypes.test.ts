import { describe, expect, it } from 'vitest'
import {
  aggregateDaily,
  alignToLocalDays,
  asNumber,
  buildFilter,
  getPath,
  pointTimes,
  reduceHeartRateDay,
  toKebab,
  toSnake,
} from './healthTypes.ts'

describe('names and filters', () => {
  it('derives kebab and snake case from the DataPoint field', () => {
    expect(toKebab('heartRate')).toBe('heart-rate')
    expect(toKebab('vo2Max')).toBe('vo2-max')
    expect(toKebab('dailyVo2Max')).toBe('daily-vo2-max')
    expect(toSnake('dailyHeartRateVariability')).toBe('daily_heart_rate_variability')
  })

  it('builds each documented filter family', () => {
    expect(buildFilter('interval', 'activeMinutes', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')).toBe(
      'active_minutes.interval.start_time >= "2026-09-01T00:00:00.000Z" AND active_minutes.interval.start_time < "2026-09-02T00:00:00.000Z"',
    )
    expect(buildFilter('sample', 'heartRate', 'a', 'b')).toBe(
      'heart_rate.sample_time.physical_time >= "a" AND heart_rate.sample_time.physical_time < "b"',
    )
    expect(buildFilter('date', 'dailyRestingHeartRate', '2026-09-01T18:30:00.000Z', '2026-09-08T18:30:00.000Z')).toBe(
      'daily_resting_heart_rate.date >= "2026-09-01" AND daily_resting_heart_rate.date < "2026-09-08"',
    )
  })
})

describe('reading points', () => {
  it('parses numbers the API sends as strings', () => {
    expect(asNumber('72')).toBe(72)
    expect(asNumber(72)).toBe(72)
    expect(asNumber('')).toBeNull()
    expect(asNumber('abc')).toBeNull()
    expect(asNumber(null)).toBeNull()
  })

  it('reads a dotted path and tolerates gaps', () => {
    expect(getPath({ a: { b: 3 } }, 'a.b')).toBe(3)
    expect(getPath({ a: null }, 'a.b')).toBeUndefined()
  })

  it('finds the time of interval, sample and date points', () => {
    expect(pointTimes('interval', { interval: { startTime: 'S', endTime: 'E' } })).toEqual({ recordedAt: 'S', endAt: 'E' })
    expect(pointTimes('sample', { sampleTime: { physicalTime: 'T' } })).toEqual({ recordedAt: 'T', endAt: null })
    expect(pointTimes('date', { date: { year: 2026, month: 9, day: 30 } })).toEqual({
      recordedAt: '2026-09-30T00:00:00.000Z',
      endAt: null,
    })
    expect(pointTimes('sample', {})).toBeNull()
  })
})

describe('aggregateDaily', () => {
  const tz = 'Asia/Kolkata'
  const at = (iso: string) => new Date(iso).getTime()

  it('groups points into the person’s local days and sums minutes and the numeric field', () => {
    const rows = aggregateDaily(
      [
        // 20:00 UTC on the 29th is the morning of the 30th in India.
        { startMs: at('2026-09-29T20:00:00Z'), endMs: at('2026-09-29T20:10:00Z'), inner: { kcal: '5' } },
        { startMs: at('2026-09-30T02:00:00Z'), endMs: at('2026-09-30T02:05:00Z'), inner: { kcal: 2.5 } },
        { startMs: at('2026-09-29T10:00:00Z'), endMs: at('2026-09-29T10:01:00Z'), inner: { kcal: 1 } },
      ],
      'kcal',
      tz,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].value).toEqual({ count: 1, minutes: 1, sum: 1 })
    expect(rows[1].value).toEqual({ count: 2, minutes: 15, sum: 7.5 })
    expect(rows[1].recordedAt).toBe('2026-09-29T18:30:00.000Z')
    expect(rows[1].endAt).toBe('2026-09-30T18:30:00.000Z')
  })

  it('leaves the sum null when the type has no numeric field', () => {
    const rows = aggregateDaily([{ startMs: at('2026-09-30T05:00:00Z'), endMs: null, inner: {} }], undefined, 'UTC')
    expect(rows[0].value).toEqual({ count: 1, minutes: 0, sum: null })
  })

  it('widens a window to whole local days', () => {
    const { startMs, endMs } = alignToLocalDays(at('2026-09-30T03:00:00Z'), at('2026-09-30T09:00:00Z'), tz)
    expect(new Date(startMs).toISOString()).toBe('2026-09-29T18:30:00.000Z')
    expect(new Date(endMs).toISOString()).toBe('2026-09-30T18:30:00.000Z')
  })
})

describe('reduceHeartRateDay', () => {
  const start = Date.UTC(2026, 8, 30, 0)
  const end = start + 24 * 3600_000

  it('averages readings into one per minute and keeps day stats', () => {
    const day = reduceHeartRateDay(
      [
        { tMs: start + 5_000, bpm: 60 },
        { tMs: start + 35_000, bpm: 64 },
        { tMs: start + 61_000, bpm: 90 },
      ],
      start,
      end,
    )
    expect(day).toEqual({ points: [[0, 62], [1, 90]], min: 60, max: 90, avg: 71.3, count: 3 })
  })

  it('ignores readings outside the day and nonsense values', () => {
    const day = reduceHeartRateDay(
      [
        { tMs: start - 1, bpm: 70 },
        { tMs: end, bpm: 70 },
        { tMs: start + 1000, bpm: 0 },
        { tMs: start + 1000, bpm: Number.NaN },
        { tMs: start + 1000, bpm: 55 },
      ],
      start,
      end,
    )
    expect(day?.count).toBe(1)
    expect(day?.points).toEqual([[0, 55]])
  })

  it('returns null for a day with no readings, so nothing empty is stored', () => {
    expect(reduceHeartRateDay([], start, end)).toBeNull()
  })

  it('caps a full day at 1,440 points', () => {
    const samples = Array.from({ length: 24 * 3600 / 5 }, (_, i) => ({ tMs: start + i * 5000, bpm: 70 }))
    expect(reduceHeartRateDay(samples, start, end)?.points).toHaveLength(1440)
  })
})
