import { MINUTES_PER_DAY, type ScheduleBounds } from './scheduling'
import { localDateISO, localMinutesOf } from '@/lib/localTime'

/* ------------------------------------------------------------------ *
 * The 6 AM → 6 AM day — shared by both interfaces (Classic and Lumen).
 *
 * The day named by date D runs from 06:00 on D to 06:00 on D+1: the Day
 * row is 06:00–18:00 on D, the Night row 18:00 on D to 06:00 on D+1.
 * Everything after midnight is shown as part of the evening before it, so
 * on the Oct 2 page, 12 AM – 6 AM means the early hours of Oct 3.
 *
 * STORAGE NEVER CHANGES (rule 2): every activity still belongs to the
 * calendar date it starts on, with `startMinutes` counted from that date's
 * own midnight. An entry at 01:30 on the 13th is stored on the 13th; only
 * this module decides it is shown on the 12th's Night row.
 *
 * To draw and overlap-check one day, three calendar dates are laid end to
 * end on one continuous minute axis measured from D's midnight:
 *
 *   D-1 → [-1440, 0)     only matters when something from the evening
 *                        before runs past 06:00 on D (a long sleep)
 *   D   → [0, 1440)
 *   D+1 → [1440, 2880)
 *
 * The day itself is [360, 1800) on that axis. Placement on the axis goes
 * through the same `domain/scheduling.ts` functions with `AXIS_BOUNDS`.
 * Pure — no React, no storage.
 * ------------------------------------------------------------------ */

/** 06:00 on D — the day and its Day row start here. */
export const DAY_START = 6 * 60
/** 18:00 on D — the Night row starts here. */
export const NIGHT_START = 18 * 60
/** 06:00 on D+1 — the day ends here. */
export const DAY_END = MINUTES_PER_DAY + DAY_START

/** The three loaded calendar dates, end to end. */
export const AXIS_BOUNDS: ScheduleBounds = { floor: -MINUTES_PER_DAY, horizon: 2 * MINUTES_PER_DAY }

/* ---------------------------- dates ---------------------------- */

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}

/** `YYYY-MM-DD` shifted by whole calendar days. Pure date arithmetic — immune to DST. */
export function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = isoParts(iso)
  const shifted = new Date(Date.UTC(y, m - 1, d + delta))
  return shifted.toISOString().slice(0, 10)
}

/** Whole calendar days from `a` to `b` (`b - a`). */
export function daysBetweenISO(a: string, b: string): number {
  const [ay, am, ad] = isoParts(a)
  const [by, bm, bd] = isoParts(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** The day an instant falls in: before 06:00 still belongs to the day before. */
export function dayOf(now: Date): string {
  const today = localDateISO(now)
  return localMinutesOf(now) < DAY_START ? addDaysISO(today, -1) : today
}

/**
 * The day to switch to when the clock ticks from `prevNow` to `now`, or
 * `null` to stay. A board following "today" moves on when the day changes
 * (at 06:00, see `dayOf`) — including after a long suspend, straight to the
 * current day. A board the user deliberately pinned to some other day
 * (rule 12) is never moved: only the state from just BEFORE this tick
 * decides it was following today.
 */
export function rolloverDay(viewedDayISO: string, prevNow: Date, now: Date): string | null {
  const prevDay = dayOf(prevNow)
  const nowDay = dayOf(now)
  return prevDay !== nowDay && viewedDayISO === prevDay ? nowDay : null
}

/** The calendar dates a day needs loaded, in axis order. */
export function dayDates(dayISO: string): { prev: string; day: string; next: string } {
  return { prev: addDaysISO(dayISO, -1), day: dayISO, next: addDaysISO(dayISO, 1) }
}

/* ----------------------------- axis ---------------------------- */

/** Where an axis minute is stored: its calendar date and minutes since that date's midnight. */
export function axisToStorage(dayISO: string, axisMinute: number): { date: string; startMinutes: number } {
  const dayOffset = Math.floor(axisMinute / MINUTES_PER_DAY)
  return {
    date: addDaysISO(dayISO, dayOffset),
    startMinutes: axisMinute - dayOffset * MINUTES_PER_DAY,
  }
}

/** A stored (date, startMinutes) pair on `dayISO`'s axis. */
export function storageToAxis(dayISO: string, date: string, startMinutes: number): number {
  return daysBetweenISO(dayISO, date) * MINUTES_PER_DAY + startMinutes
}

/**
 * A typed wall-clock time (minutes since midnight, 0–1439) → the minute on
 * the day's axis it means. 00:00–05:59 belongs to the night after, so it
 * lands on the next calendar date (1440+).
 */
export function axisFromClock(clockMinutes: number): number {
  return clockMinutes < DAY_START ? clockMinutes + MINUTES_PER_DAY : clockMinutes
}

/** True when `minute` falls inside the day's [06:00, 06:00) window. */
export function isInDay(minute: number): boolean {
  return minute >= DAY_START && minute < DAY_END
}

/**
 * The activities that belong to the day — those that START inside it (an
 * axis-placed list). What a day's counts, totals and exports use; a long
 * sleep from the evening before still draws its morning hours on the Day
 * row, but it belongs to the day it started in.
 */
export function startingInDay<T extends { startMinutes: number }>(activities: readonly T[]): T[] {
  return activities.filter((a) => isInDay(a.startMinutes))
}
