/**
 * Pure time-math shared by every "quick log" control — a control that
 * records a real `ScheduledActivity` directly from a typed start/end clock
 * time, bypassing the tile-row/duration-drag-block picker entirely (Sun
 * Exposure, Moon Exposure, Vipassana — see the full-stack-engineer agent
 * definition's Phase 2 scope: these three are `entry_mode: 'quick_log'` in
 * `public.activities`). No React, no Supabase — mirrors how
 * `domain/notes.ts`/`domain/scheduling.ts` keep this kind of logic
 * component-free. `domain/timeInput.ts` handles the KEYBOARD-entry side of a
 * `TimeField`; this module is what turns its resolved `"HH:MM"` value into
 * schedule-ready minutes, and formats a logged stretch back for display.
 *
 * There is no separate storage or "total" concept here any more (the old
 * `SunMoonEntry`/`entriesForDay`/`totalMinutesForDay` local-store shape this
 * module replaces) — a quick-log entry IS a `ScheduledActivity` like any
 * other, so "today's entries" and "today's total" are just a filter/reduce
 * over the board's own `activities` list, done at the call site.
 */

/** `"HH:MM"` (24h) → minutes since local midnight, or `null` if malformed. */
export function clockToMinutes(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * Minutes between `start` and `end`. An `end` at or before `start` is read as
 * crossing midnight (23:30 to 00:15 is 45 minutes), so a full 24h is added —
 * this mirrors rule 2 exactly: the resulting activity is still anchored at
 * `start` on the viewed day, with a duration that pushes its end past 1440.
 * Returns `null` if either value is not a valid `HH:MM`.
 */
export function durationBetween(start: string, end: string): number | null {
  const s = clockToMinutes(start)
  const e = clockToMinutes(end)
  if (s === null || e === null) return null
  return e > s ? e - s : e + 24 * 60 - s
}

/** `"09:05"` → `"9:05 AM"`, device-locale-independent (fixed 12h clock). */
export function formatClock(hhmm: string): string {
  const total = clockToMinutes(hhmm)
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

/** Store/Save is enabled only for two real `HH:MM` values spanning more than 0 and at most 24h. */
export function canSubmitQuickLog(start: string, end: string): boolean {
  const mins = durationBetween(start, end)
  return mins !== null && mins > 0 && mins <= 24 * 60
}
