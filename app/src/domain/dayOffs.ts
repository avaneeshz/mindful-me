/**
 * Day off — marking a calendar day as a non-working day, with an optional
 * short reason. Pure rules only (no React, no storage, no Supabase); see
 * `state/useDayOffs.ts` for the local-first cache + sync and
 * `20261005070000_day_offs.sql` for the server side, which enforces the same
 * limits.
 */
import { buildMonthGrid } from './calendar'
import { localDateISO } from '@/lib/localTime'

export interface DayOff {
  /** The user's own calendar day, `YYYY-MM-DD` — never a UTC instant. */
  localDate: string
  /** IANA zone the day was marked in (portability rule 6). */
  timeZone: string
  reason: string | null
  updatedAt: string
}

/** Matches the server's `reason_too_long` check. */
export const DAY_OFF_REASON_MAX = 280

/** Trims, collapses blank to `null`, and caps at `DAY_OFF_REASON_MAX` characters. */
export function normalizeDayOffReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') return null
  return Array.from(trimmed).slice(0, DAY_OFF_REASON_MAX).join('')
}

/**
 * The inclusive `YYYY-MM-DD` window the date picker shows for `month` — its
 * full 6-week grid, so days spilling in from the neighbouring months still
 * show their marker. This is the only range ever fetched at once (rule 8).
 */
export function dayOffWindowForMonth(month: Date): {
  from: string
  to: string
} {
  const grid = buildMonthGrid(new Date(month.getFullYear(), month.getMonth(), 1))
  return {
    from: localDateISO(grid[0]),
    to: localDateISO(grid[grid.length - 1]),
  }
}

/** Replaces the window `[from, to]` of `cache` with `fresh` (server wins inside it), leaving other days alone. */
export function mergeDayOffWindow(
  cache: Readonly<Record<string, DayOff>>,
  window: { from: string; to: string },
  fresh: readonly DayOff[],
): Record<string, DayOff> {
  const next: Record<string, DayOff> = {}
  for (const [iso, dayOff] of Object.entries(cache)) {
    if (iso < window.from || iso > window.to) next[iso] = dayOff
  }
  for (const dayOff of fresh) next[dayOff.localDate] = dayOff
  return next
}
