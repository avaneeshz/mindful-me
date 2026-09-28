import { MINUTES_PER_DAY, type ScheduleBounds } from '@/domain/scheduling'
import type { ScheduledActivity } from '@/domain/types'
import { localDateISO, localMinutesOf } from '@/lib/localTime'

/* ------------------------------------------------------------------ *
 * The Lumen day.
 *
 * A Lumen day named by date D runs from 06:00 on D to 06:00 on D+1: the
 * Day strip is 06:00–18:00 on D, the Night strip 18:00 on D to 06:00 on
 * D+1. Everything after midnight is shown as part of the evening before it.
 *
 * STORAGE NEVER CHANGES (rule 2): every activity still belongs to the
 * calendar date it starts on, with `startMinutes` counted from that date's
 * own midnight. An entry at 01:30 on the 13th is stored on the 13th; only
 * this module decides that Lumen shows it on the 12th's Night strip.
 *
 * To draw and overlap-check one Lumen day, three calendar dates are laid
 * end to end on one continuous minute axis measured from D's midnight:
 *
 *   D-1 → [-1440, 0)     only matters when something from the evening
 *                        before runs past 06:00 on D (a long sleep)
 *   D   → [0, 1440)
 *   D+1 → [1440, 2880)
 *
 * The Lumen day itself is [360, 1800) on that axis. Placement on the axis
 * goes through the same `domain/scheduling.ts` functions Classic uses, with
 * `LUMEN_AXIS_BOUNDS` instead of one calendar day's [0, 1440).
 * ------------------------------------------------------------------ */

/** 06:00 on D — the Lumen day and its Day strip start here. */
export const LUMEN_DAY_START = 6 * 60
/** 18:00 on D — the Night strip starts here. */
export const LUMEN_NIGHT_START = 18 * 60
/** 06:00 on D+1 — the Lumen day ends here. */
export const LUMEN_DAY_END = MINUTES_PER_DAY + LUMEN_DAY_START

/** The three loaded calendar dates, end to end. */
export const LUMEN_AXIS_BOUNDS: ScheduleBounds = { floor: -MINUTES_PER_DAY, horizon: 2 * MINUTES_PER_DAY }

export type StripPeriod = 'day' | 'night'

export const STRIP_RANGE: Record<StripPeriod, { start: number; end: number }> = {
  day: { start: LUMEN_DAY_START, end: LUMEN_NIGHT_START },
  night: { start: LUMEN_NIGHT_START, end: LUMEN_DAY_END },
}

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

/** The Lumen day an instant falls in: before 06:00 still belongs to the day before. */
export function lumenDayOf(now: Date): string {
  const today = localDateISO(now)
  return localMinutesOf(now) < LUMEN_DAY_START ? addDaysISO(today, -1) : today
}

/** The calendar dates a Lumen day needs loaded, in axis order. */
export function lumenDayDates(dayISO: string): { prev: string; day: string; next: string } {
  return { prev: addDaysISO(dayISO, -1), day: dayISO, next: addDaysISO(dayISO, 1) }
}

/* ----------------------------- axis ---------------------------- */

/** One stored activity, placed on a Lumen day's axis. */
export interface AxisActivity {
  activity: ScheduledActivity
  /** The calendar date it is stored under (the date it started on). */
  date: string
  /** [start, end) on the axis — minutes from the Lumen day's own midnight. */
  start: number
  end: number
}

/**
 * Every real activity from the three dates, placed on `dayISO`'s axis and
 * sorted by start. Zero-length legacy flag markers are left out: they take
 * no time, so they neither draw nor block anything.
 */
export function toAxis(dayISO: string, byDate: Readonly<Record<string, readonly ScheduledActivity[] | undefined>>): AxisActivity[] {
  const placed: AxisActivity[] = []
  const dates = lumenDayDates(dayISO)
  for (const date of [dates.prev, dates.day, dates.next]) {
    const offset = daysBetweenISO(dayISO, date) * MINUTES_PER_DAY
    for (const activity of byDate[date] ?? []) {
      if (activity.durationMinutes <= 0) continue
      const start = offset + activity.startMinutes
      placed.push({ activity, date, start, end: start + activity.durationMinutes })
    }
  }
  return placed.sort((a, b) => a.start - b.start)
}

/**
 * The axis as a plain activity list with axis-relative `startMinutes` —
 * the shape `domain/scheduling.ts` works on.
 */
export function schedulingList(axis: readonly AxisActivity[]): ScheduledActivity[] {
  return axis.map(({ activity, start }) => ({ ...activity, startMinutes: start }))
}

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

/** "Now" on `dayISO`'s axis — may fall outside the Lumen day when viewing another day. */
export function nowOnAxis(dayISO: string, now: Date): number {
  return storageToAxis(dayISO, localDateISO(now), localMinutesOf(now))
}

/** True when `minute` falls inside the Lumen day's [06:00, 06:00) window. */
export function isInLumenDay(minute: number): boolean {
  return minute >= LUMEN_DAY_START && minute < LUMEN_DAY_END
}

/* --------------------------- drawing --------------------------- */

/** The visible part of one activity on one strip. */
export interface StripPiece {
  activity: ScheduledActivity
  /** Clipped [start, end) on the axis. */
  start: number
  end: number
  /** True when the activity also runs before this piece (into the previous strip or day). */
  continuesBefore: boolean
  /** True when it also runs after this piece. */
  continuesAfter: boolean
}

/**
 * The pieces a strip draws. A midnight-crossing activity is ONE stored row
 * but draws as the pieces of it each strip can see — a 10 PM → 7 AM sleep
 * fills the rest of the Night strip here and the first hour of the next
 * Lumen day's Day strip there.
 */
export function stripPieces(axis: readonly AxisActivity[], period: StripPeriod): StripPiece[] {
  const range = STRIP_RANGE[period]
  const pieces: StripPiece[] = []
  for (const item of axis) {
    const start = Math.max(item.start, range.start)
    const end = Math.min(item.end, range.end)
    if (end <= start) continue
    pieces.push({
      activity: item.activity,
      start,
      end,
      continuesBefore: item.start < start,
      continuesAfter: item.end > end,
    })
  }
  return pieces
}

/** Minutes of `item` inside [from, to). */
export function minutesWithin(item: Pick<AxisActivity, 'start' | 'end'>, from: number, to: number): number {
  return Math.max(0, Math.min(item.end, to) - Math.max(item.start, from))
}

/** The activities that touch [from, to), in time order. */
export function activitiesWithin(axis: readonly AxisActivity[], from: number, to: number): AxisActivity[] {
  return axis.filter((item) => minutesWithin(item, from, to) > 0)
}

/**
 * Minutes logged inside the Lumen day, grouped by `keyOf` — the totals
 * "Where today went" and the tiles show. Only the part of an activity
 * inside 06:00 → 06:00 counts, so a long sleep that started the evening
 * before counts only its morning hours here, and the rest the night before.
 */
export function minutesByKey(
  axis: readonly AxisActivity[],
  keyOf: (activity: ScheduledActivity) => string,
  from: number = LUMEN_DAY_START,
  to: number = LUMEN_DAY_END,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const item of axis) {
    const minutes = minutesWithin(item, from, to)
    if (minutes <= 0) continue
    const key = keyOf(item.activity)
    totals.set(key, (totals.get(key) ?? 0) + minutes)
  }
  return totals
}

/** Total minutes logged inside the Lumen day. Activities never overlap (rule 1), so a plain sum is exact. */
export function loggedMinutes(axis: readonly AxisActivity[]): number {
  return axis.reduce((sum, item) => sum + minutesWithin(item, LUMEN_DAY_START, LUMEN_DAY_END), 0)
}

/* ----------------------------- text ---------------------------- */

const pad = (n: number) => String(n).padStart(2, '0')

/** Axis minute → "21:30" (24h, wraps past midnight). */
export function axisClock(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/**
 * A typed wall-clock time (minutes since midnight, 0–1439) → the minute on
 * the Lumen day's axis it means. 00:00–05:59 belongs to the night after, so
 * it lands on the next calendar date (1440+).
 */
export function axisFromClock(clockMinutes: number): number {
  return clockMinutes < LUMEN_DAY_START ? clockMinutes + MINUTES_PER_DAY : clockMinutes
}

/**
 * Duration from an axis start to a typed end time. An end at or before the
 * start's clock time reads as the next morning (23:00 → 07:00 is 8 hours) —
 * the same rule Classic's quick-log `durationBetween` follows.
 */
export function durationToClock(start: number, endClockMinutes: number): number {
  const startClock = ((start % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const diff = endClockMinutes - startClock
  return diff > 0 ? diff : diff + MINUTES_PER_DAY
}
