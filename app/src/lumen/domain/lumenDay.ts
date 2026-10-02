import { DAY_END, DAY_START, NIGHT_START, daysBetweenISO, dayDates, storageToAxis } from '@/domain/dayAxis'
import { MINUTES_PER_DAY } from '@/domain/scheduling'
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

// The day model itself (06:00 → 06:00, the three-date axis, date math) is
// shared with Classic and lives in `domain/dayAxis.ts`; re-exported here
// under Lumen's original names so every Lumen import keeps working.
export {
  DAY_START as LUMEN_DAY_START,
  NIGHT_START as LUMEN_NIGHT_START,
  DAY_END as LUMEN_DAY_END,
  AXIS_BOUNDS as LUMEN_AXIS_BOUNDS,
  addDaysISO,
  daysBetweenISO,
  dayOf as lumenDayOf,
  dayDates as lumenDayDates,
  axisToStorage,
  storageToAxis,
  axisFromClock,
} from '@/domain/dayAxis'

export type StripPeriod = 'day' | 'night'

export const STRIP_RANGE: Record<StripPeriod, { start: number; end: number }> = {
  day: { start: DAY_START, end: NIGHT_START },
  night: { start: NIGHT_START, end: DAY_END },
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
  const dates = dayDates(dayISO)
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

/** "Now" on `dayISO`'s axis — may fall outside the Lumen day when viewing another day. */
export function nowOnAxis(dayISO: string, now: Date): number {
  return storageToAxis(dayISO, localDateISO(now), localMinutesOf(now))
}

/** True when `minute` falls inside the Lumen day's [06:00, 06:00) window. */
export function isInLumenDay(minute: number): boolean {
  return minute >= DAY_START && minute < DAY_END
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
  from: number = DAY_START,
  to: number = DAY_END,
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
  return axis.reduce((sum, item) => sum + minutesWithin(item, DAY_START, DAY_END), 0)
}

/* ----------------------------- text ---------------------------- */

const pad = (n: number) => String(n).padStart(2, '0')

/** Axis minute → "21:30" (24h, wraps past midnight). */
export function axisClock(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
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
