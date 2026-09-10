/**
 * Sun / Moon light logging — tapping a timeline end-cap records a stretch of
 * time spent in sun light (Day cap) or moon light (Night cap), by start and
 * end clock time, scoped to the day being viewed. This module is the pure,
 * DB/React-free core — types, duration maths, validation, formatting —
 * mirroring how `domain/notes.ts` keeps the header-pill logic component-free.
 * Persistence lives in `lib/sunMoonLogLocalStore.ts`, the hook in
 * `state/useSunMoonLog.ts`.
 */

export type SunMoonKind = 'sun' | 'moon'

/** One logged stretch. `date` is the viewed day it belongs to (`YYYY-MM-DD`, device-local). */
export interface SunMoonEntry {
  id: string
  kind: SunMoonKind
  /** `YYYY-MM-DD` in the device timezone — the day this stretch is filed under. */
  date: string
  /** `HH:MM`, 24h. */
  start: string
  /** `HH:MM`, 24h. */
  end: string
  createdAt: string
}

export const SUN_MOON_HEADING: Record<SunMoonKind, string> = {
  sun: 'Sun Exposure',
  moon: 'Moon Exposure',
}

function minutesOfClock(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * Minutes between `start` and `end`. An `end` at or before `start` is read as
 * crossing midnight (a moon stretch from 23:30 to 00:15 is 45 minutes), so a
 * full 24h is added. Returns `null` if either value is not a valid `HH:MM`.
 */
export function durationMinutes(start: string, end: string): number | null {
  const s = minutesOfClock(start)
  const e = minutesOfClock(end)
  if (s === null || e === null) return null
  return e > s ? e - s : e + 24 * 60 - s
}

/** `"09:05"` → `"9:05 AM"`, device-locale-independent (fixed 12h clock). */
export function formatClock(hhmm: string): string {
  const total = minutesOfClock(hhmm)
  if (total === null) return hhmm
  const h24 = Math.floor(total / 60)
  const m = total % 60
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** `45` → `"45m"`, `75` → `"1h 15m"`, `120` → `"2h"`. */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Store is enabled only for two real `HH:MM` values that span more than 0 and at most 24h. */
export function canSubmitSunMoon(start: string, end: string): boolean {
  const mins = durationMinutes(start, end)
  return mins !== null && mins > 0 && mins <= 24 * 60
}

/** Total logged minutes of one kind on one day — the number shown beside the popover heading. */
export function totalMinutesForDay(entries: readonly SunMoonEntry[], date: string): number {
  return entries
    .filter((entry) => entry.date === date)
    .reduce((sum, entry) => sum + (durationMinutes(entry.start, entry.end) ?? 0), 0)
}

/** One day's entries, newest first (the list is already stored newest-first). */
export function entriesForDay(entries: readonly SunMoonEntry[], date: string): SunMoonEntry[] {
  return entries.filter((entry) => entry.date === date)
}
