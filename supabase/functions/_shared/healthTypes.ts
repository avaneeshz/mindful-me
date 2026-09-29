/**
 * Generic building blocks for the Google Health data types beyond the
 * original hand-mapped set: turning a `DataPoint` field name into the
 * data-type id and filter syntax, pulling a timestamp out of a point, rolling
 * high-volume points into per-day totals, and reducing a day of heart-rate
 * samples to one reading per minute.
 *
 * Pure — no Deno globals — so the app's Vitest suite covers it. Facts about
 * the field names, filter patterns and time shapes come from the real
 * `@googleapis/health@6.0.0` client's `v4.ts`, same source `googleHealth.ts`
 * documents.
 */

import { localDateKey, localMidnightUtc, nextDayKey, parseYmd } from './timeZone.ts'

/** How a data type's points are filtered by time — one of the API's documented filter families. */
export type FilterKind = 'interval' | 'sample' | 'date'

/** `vo2Max` -> `vo2-max`; the data type id in the URL is the kebab-case of the `DataPoint` field. */
export function toKebab(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** `vo2Max` -> `vo2_max`; filter expressions use the snake_case field name. */
export function toSnake(field: string): string {
  return toKebab(field).replace(/-/g, '_')
}

/** A closed-open window filter in the syntax the list endpoint documents for each family. */
export function buildFilter(kind: FilterKind, field: string, startIso: string, endIso: string): string {
  const name = toSnake(field)
  if (kind === 'interval') {
    return `${name}.interval.start_time >= "${startIso}" AND ${name}.interval.start_time < "${endIso}"`
  }
  if (kind === 'sample') {
    return `${name}.sample_time.physical_time >= "${startIso}" AND ${name}.sample_time.physical_time < "${endIso}"`
  }
  return `${name}.date >= "${startIso.slice(0, 10)}" AND ${name}.date < "${endIso.slice(0, 10)}"`
}

export function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Reads a dotted path (`activeMinutesByActivityLevel.0.minutes` is not supported — plain keys only). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export interface PointTimes {
  recordedAt: string
  endAt: string | null
}

/** Where a point sits in time, per its filter family, or `null` when the point carries no usable time. */
export function pointTimes(kind: FilterKind, inner: Record<string, unknown>): PointTimes | null {
  if (kind === 'interval') {
    const interval = inner.interval as Record<string, unknown> | undefined
    const start = interval?.startTime
    if (typeof start !== 'string') return null
    const end = interval?.endTime
    return { recordedAt: start, endAt: typeof end === 'string' ? end : null }
  }
  if (kind === 'sample') {
    const sample = inner.sampleTime as Record<string, unknown> | undefined
    const at = sample?.physicalTime
    return typeof at === 'string' ? { recordedAt: at, endAt: null } : null
  }
  const date = inner.date as Record<string, unknown> | undefined
  const year = asNumber(date?.year)
  const month = asNumber(date?.month)
  const day = asNumber(date?.day)
  if (year === null || month === null || day === null) return null
  return { recordedAt: new Date(Date.UTC(year, month - 1, day)).toISOString(), endAt: null }
}

export interface DailyTotal {
  count: number
  /** Total minutes covered by the points' intervals. */
  minutes: number
  /** Sum of the type's numeric field, or `null` when it has none. */
  sum: number | null
}

export interface DailyTotalRow extends PointTimes {
  value: DailyTotal
}

/**
 * Rolls high-volume interval points (one per minute, say) into one row per
 * local day. Rows carry the day's start and the next day's start so they line
 * up with the person's own calendar. Only whole local days that the input
 * window fully covers should be trusted — callers align their window to local
 * midnights (see `alignToLocalDays`).
 */
export function aggregateDaily(
  points: Array<{ startMs: number; endMs: number | null; inner: Record<string, unknown> }>,
  sumPath: string | undefined,
  tz: string,
): DailyTotalRow[] {
  const byDay = new Map<string, DailyTotal>()
  for (const p of points) {
    const key = localDateKey(p.startMs, tz)
    const total = byDay.get(key) ?? { count: 0, minutes: 0, sum: null }
    total.count += 1
    if (p.endMs !== null && p.endMs > p.startMs) total.minutes += (p.endMs - p.startMs) / 60000
    if (sumPath) {
      const n = asNumber(getPath(p.inner, sumPath))
      if (n !== null) total.sum = (total.sum ?? 0) + n
    }
    byDay.set(key, total)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => {
      const start = localMidnightUtc(parseYmd(key), tz)
      const end = localMidnightUtc(parseYmd(nextDayKey(key)), tz)
      return {
        recordedAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        value: { ...value, minutes: Math.round(value.minutes * 10) / 10 },
      }
    })
}

/** Expands a window to whole local days so per-day totals never come from a partial day. */
export function alignToLocalDays(startMs: number, endMs: number, tz: string): { startMs: number; endMs: number } {
  const startKey = localDateKey(startMs, tz)
  const alignedStart = localMidnightUtc(parseYmd(startKey), tz)
  const alignedEnd = localMidnightUtc(parseYmd(nextDayKey(localDateKey(endMs, tz))), tz)
  return { startMs: alignedStart, endMs: alignedEnd }
}

export interface HeartRateDay {
  /** `[minute of the local day, average bpm]`, one entry per minute that has a reading. */
  points: Array<[number, number]>
  min: number
  max: number
  avg: number
  /** Raw readings the minute averages were built from. */
  count: number
}

/**
 * One day of heart-rate samples -> one reading per minute (at most 1,440), so a
 * whole day is a few kilobytes instead of tens of thousands of rows.
 */
export function reduceHeartRateDay(
  samples: Array<{ tMs: number; bpm: number }>,
  dayStartMs: number,
  dayEndMs: number,
): HeartRateDay | null {
  const buckets = new Map<number, { sum: number; n: number }>()
  let min = Infinity
  let max = -Infinity
  let total = 0
  let count = 0
  for (const s of samples) {
    if (s.tMs < dayStartMs || s.tMs >= dayEndMs || !Number.isFinite(s.bpm) || s.bpm <= 0) continue
    const minute = Math.floor((s.tMs - dayStartMs) / 60000)
    const b = buckets.get(minute) ?? { sum: 0, n: 0 }
    b.sum += s.bpm
    b.n += 1
    buckets.set(minute, b)
    min = Math.min(min, s.bpm)
    max = Math.max(max, s.bpm)
    total += s.bpm
    count += 1
  }
  if (count === 0) return null
  const points = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, b]): [number, number] => [minute, Math.round((b.sum / b.n) * 10) / 10])
  return { points, min, max, avg: Math.round((total / count) * 10) / 10, count }
}
