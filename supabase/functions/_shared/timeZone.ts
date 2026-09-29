/**
 * Local-day arithmetic for the sync function. A "day" of health data is the
 * person's own calendar day (from their Google Health settings' IANA time
 * zone), not a UTC day — otherwise a day in India would be cut at 05:30.
 *
 * Pure: no Deno globals, so it is unit-tested with the app's Vitest suite.
 */

const FALLBACK_TZ = 'UTC'

// Building an Intl.DateTimeFormat is expensive and these run once per reading
// (tens of thousands per sync), so each zone's formatters are built once.
const partsFormatters = new Map<string, Intl.DateTimeFormat>()
const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(tz, f)
  }
  return f
}

function dateKeyFormatter(tz: string): Intl.DateTimeFormat {
  let f = dateKeyFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    dateKeyFormatters.set(tz, f)
  }
  return f
}

/** `tz` if `Intl` accepts it, otherwise UTC — a bad zone must never fail a sync. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return FALLBACK_TZ
  try {
    dateKeyFormatter(tz)
    return tz
  } catch {
    return FALLBACK_TZ
  }
}

/** Milliseconds `tz` is ahead of UTC at the instant `utcMs` (negative when behind). */
export function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = partsFormatter(tz).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

export interface Ymd {
  year: number
  month: number
  day: number
}

/** The UTC instant at which `ymd` begins in `tz` (handles DST transitions). */
export function localMidnightUtc({ year, month, day }: Ymd, tz: string): number {
  const guess = Date.UTC(year, month - 1, day)
  const first = guess - tzOffsetMs(guess, tz)
  // The offset at the guess can differ from the offset at the real instant
  // when a DST change falls between them — one correction settles it.
  return guess - tzOffsetMs(first, tz)
}

/** `YYYY-MM-DD` of the local calendar day containing `utcMs`. */
export function localDateKey(utcMs: number, tz: string): string {
  return dateKeyFormatter(tz).format(new Date(utcMs))
}

export function parseYmd(key: string): Ymd {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month, day }
}

export function addDays(ymd: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** `YYYY-MM-DD` of the day after `key`. */
export function nextDayKey(key: string): string {
  const n = addDays(parseYmd(key), 1)
  return `${n.year}-${String(n.month).padStart(2, '0')}-${String(n.day).padStart(2, '0')}`
}

export interface LocalDay {
  /** `YYYY-MM-DD` */
  key: string
  startMs: number
  endMs: number
}

/** The last `count` local days ending with the one containing `nowMs`, oldest first. */
export function recentLocalDays(nowMs: number, count: number, tz: string): LocalDay[] {
  const today = parseYmd(localDateKey(nowMs, tz))
  const days: LocalDay[] = []
  for (let i = count - 1; i >= 0; i--) {
    const ymd = addDays(today, -i)
    days.push({
      key: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      startMs: localMidnightUtc(ymd, tz),
      endMs: localMidnightUtc(addDays(ymd, 1), tz),
    })
  }
  return days
}
