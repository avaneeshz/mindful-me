import { parseHeartRateDay } from '@/domain/healthMetrics'
import { localDateISO, localMinutesOf } from '@/lib/localTime'
import { daysBetweenISO, LUMEN_DAY_END, LUMEN_DAY_START, STRIP_RANGE, type StripPeriod } from '@/lumen/domain/lumenDay'

/* ------------------------------------------------------------------ *
 * Heart rate on the Lumen strips.
 *
 * Stored heart rate is one row per calendar day of the PERSON, each with
 * one reading per minute. The strips are drawn on the Lumen day's axis
 * (minutes from the browser's local midnight of day D, 06:00 -> 06:00).
 * Every reading is placed by its ABSOLUTE instant and then read back in the
 * browser's local time, exactly like activities, so a row that starts at
 * 18:30Z the day before still lands on the right strip.
 *
 * Pure: no React, no fetching.
 * ------------------------------------------------------------------ */

export interface HeartSample {
  /** Axis minute of the bucket start (a multiple of 5). */
  minute: number
  bpm: number
}

/** One point per minute — the resolution the sync stores. Readings landing on the same minute are averaged. */
export const BUCKET_MINUTES = 1
/** Consecutive buckets further apart than this are a gap: the line breaks there. */
export const GAP_MINUTES = 10
export const STRIP_SPAN = 720

/** Minimal shape read from a stored row — structurally satisfied by `HealthMetricPoint`. */
export interface HeartRateRow {
  recordedAt: string
  value: unknown
}

/**
 * One point per minute (the stored per-minute reading) across the whole Lumen day
 * (axis 360 -> 1800), sorted by time. Bad rows and readings are skipped.
 */
export function heartRateOnAxis(rows: readonly HeartRateRow[] | null | undefined, dayISO: string): HeartSample[] {
  if (!rows || !/^\d{4}-\d{2}-\d{2}$/.test(dayISO)) return []
  const sums = new Map<number, { total: number; n: number }>()
  for (const row of rows) {
    const start = Date.parse(row?.recordedAt)
    if (!Number.isFinite(start)) continue
    const data = parseHeartRateDay(row.value)
    if (!data) continue
    for (const [minuteOfDay, bpm] of data.points) {
      if (!Number.isFinite(minuteOfDay) || !Number.isFinite(bpm) || bpm <= 0) continue
      const at = new Date(start + minuteOfDay * 60_000)
      const axisMinute = daysBetweenISO(dayISO, localDateISO(at)) * 1440 + localMinutesOf(at)
      if (axisMinute < LUMEN_DAY_START || axisMinute >= LUMEN_DAY_END) continue
      const bucket = Math.floor(axisMinute / BUCKET_MINUTES) * BUCKET_MINUTES
      const s = sums.get(bucket)
      if (s) {
        s.total += bpm
        s.n += 1
      } else sums.set(bucket, { total: bpm, n: 1 })
    }
  }
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([minute, s]) => ({ minute, bpm: s.total / s.n }))
}

/** The samples inside one strip, split into runs wherever data is missing. Never bridges a gap. */
export function stripSeries(samples: readonly HeartSample[], period: StripPeriod): HeartSample[][] {
  const { start, end } = STRIP_RANGE[period]
  const segments: HeartSample[][] = []
  let current: HeartSample[] = []
  for (const s of samples) {
    if (s.minute < start || s.minute >= end) continue
    const last = current[current.length - 1]
    if (last && s.minute - last.minute > GAP_MINUTES) {
      segments.push(current)
      current = []
    }
    current.push(s)
  }
  if (current.length) segments.push(current)
  return segments
}

const SCALE_PAD = 3
const MIN_SCALE_RANGE = 10

/** One vertical scale for the whole Lumen day, so day and night compare. */
export function heartRateScale(samples: readonly HeartSample[]): { min: number; max: number } {
  if (samples.length === 0) return { min: 50, max: 110 }
  let lo = Infinity
  let hi = -Infinity
  for (const s of samples) {
    lo = Math.min(lo, s.bpm)
    hi = Math.max(hi, s.bpm)
  }
  lo -= SCALE_PAD
  hi += SCALE_PAD
  if (hi - lo < MIN_SCALE_RANGE) {
    const mid = (hi + lo) / 2
    lo = mid - MIN_SCALE_RANGE / 2
    hi = mid + MIN_SCALE_RANGE / 2
  }
  return { min: lo, max: hi }
}

/** Lowest and highest whole bpm, for the accessible label. */
export function heartRateSummary(samples: readonly HeartSample[]): { min: number; max: number } | null {
  if (samples.length === 0) return null
  let lo = Infinity
  let hi = -Infinity
  for (const s of samples) {
    lo = Math.min(lo, s.bpm)
    hi = Math.max(hi, s.bpm)
  }
  return { min: Math.round(lo), max: Math.round(hi) }
}

export interface WaveformOptions {
  rangeStart: number
  span: number
  width: number
  height: number
  padY: number
  min: number
  max: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * SVG path for one segment: a monotone cubic (Fritsch-Carlson), so the curve
 * never leaves the range of its own points and y stays inside [padY, height - padY].
 * A single point becomes a short flat tick.
 */
export function waveformPath(segment: readonly HeartSample[], o: WaveformOptions): string {
  if (segment.length === 0 || o.width <= 0 || o.max <= o.min) return ''
  const usable = o.height - 2 * o.padY
  const pts = segment.map((s) => {
    const clamped = Math.min(o.max, Math.max(o.min, s.bpm))
    return {
      x: ((s.minute - o.rangeStart) / o.span) * o.width,
      y: o.height - o.padY - ((clamped - o.min) / (o.max - o.min)) * usable,
    }
  })
  if (pts.length === 1) {
    const { x, y } = pts[0]
    return `M ${r2(x - 1.5)} ${r2(y)} L ${r2(x + 1.5)} ${r2(y)}`
  }
  const n = pts.length
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x)
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (dx[i] || 1))
  const m: number[] = new Array(n)
  m[0] = slope[0]
  m[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / slope[i]
    const b = m[i + 1] / slope[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      m[i] = (3 * a * slope[i]) / h
      m[i + 1] = (3 * b * slope[i]) / h
    }
  }
  let d = `M ${r2(pts[0].x)} ${r2(pts[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    const w = dx[i] / 3
    d += ` C ${r2(pts[i].x + w)} ${r2(pts[i].y + m[i] * w)} ${r2(pts[i + 1].x - w)} ${r2(pts[i + 1].y - m[i + 1] * w)} ${r2(pts[i + 1].x)} ${r2(pts[i + 1].y)}`
  }
  return d
}
