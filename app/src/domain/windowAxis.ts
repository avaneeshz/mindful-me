import { addDaysISO, daysBetweenISO } from '@/domain/quickLog'
import type { ScheduleBounds } from '@/domain/scheduling'
import type { ActivityList, ScheduledActivity } from '@/domain/types'

/**
 * Classic's page is a 06:00 -> 06:00 WINDOW, not a calendar day.
 *
 * The page for day D shows D 06:00 to 18:00 (Day row), D 18:00 to 24:00 (first
 * half of the Night row) and D+1 00:00 to 06:00 (second half of the Night row).
 * Everything on the page lives on ONE continuous minute axis anchored at D's
 * midnight: D 06:00 = 360, D 24:00 = 1440, D+1 06:00 = 1800. An activity from
 * the day before has a negative start; one from the day after is >= 1440.
 *
 * Ownership is unchanged (rule 2): every activity is stored once, on the
 * calendar day it STARTED, with minutes relative to that day's own midnight.
 * This module only converts between that stored shape (per-day, own-day
 * minutes) and the page's axis. It never decides what is stored where beyond
 * "start day owns it", so nothing is duplicated and nothing is rewritten.
 *
 * Pure: no React, no storage, no network (see CLAUDE.md's portability rules).
 */

export const MINUTES_PER_DAY = 1440
/** 06:00 on the page's own day — the left edge of the Day row. */
export const WINDOW_START = 360
/** 06:00 the next day — the right edge of the Night row. */
export const WINDOW_END = 1800
/** The three calendar days a page can touch, as offsets from the page's day. */
export const WINDOW_DAY_OFFSETS = [-1, 0, 1] as const
export type WindowDayOffset = (typeof WINDOW_DAY_OFFSETS)[number]

export const CLASSIC_WINDOW_BOUNDS: ScheduleBounds = { floor: WINDOW_START, horizon: WINDOW_END }

function isReal(a: Pick<ScheduledActivity, 'durationMinutes'>): boolean {
  return a.durationMinutes > 0
}

/**
 * True when any part of `a` falls inside the window. A zero-duration flag
 * marker counts only when its own instant is inside it.
 */
export function overlapsWindow(a: Pick<ScheduledActivity, 'startMinutes' | 'durationMinutes'>): boolean {
  if (!isReal(a)) return a.startMinutes >= WINDOW_START && a.startMinutes < WINDOW_END
  return a.startMinutes < WINDOW_END && a.startMinutes + a.durationMinutes > WINDOW_START
}

/** Minutes of `a` that fall inside the window — what a page's header totals count. */
export function minutesWithinWindow(a: Pick<ScheduledActivity, 'startMinutes' | 'durationMinutes'>): number {
  const start = Math.max(a.startMinutes, WINDOW_START)
  const end = Math.min(a.startMinutes + a.durationMinutes, WINDOW_END)
  return Math.max(0, end - start)
}

/**
 * Schedule bounds for placing or editing something on the page: the window,
 * widened just enough to contain `existing` when it is an activity that
 * already runs past a window edge (Sleep 21:42 -> 10:00 viewed from the next
 * day), so it can still be edited where it is seen.
 */
export function windowBoundsFor(existing?: Pick<ScheduledActivity, 'startMinutes' | 'durationMinutes'> | null): ScheduleBounds {
  if (!existing) return CLASSIC_WINDOW_BOUNDS
  return {
    floor: Math.min(WINDOW_START, existing.startMinutes),
    horizon: Math.max(WINDOW_END, existing.startMinutes + existing.durationMinutes),
  }
}

/** A clock time typed without a date (Sun/Moon, Worship) lands inside the window: 00:00-05:59 means the NEXT morning. */
export function placeClockInWindow(minutesOfDay: number): number {
  return minutesOfDay < WINDOW_START ? minutesOfDay + MINUTES_PER_DAY : minutesOfDay
}

/** Which calendar day owns an activity on the page's axis, as an offset from the page's day (floor of start / 1440). */
export function ownerOffset(a: Pick<ScheduledActivity, 'startMinutes'>): number {
  return Math.floor(a.startMinutes / MINUTES_PER_DAY)
}

/** An activity stored on the day `offset` days from the page's day, moved onto the page's axis. */
export function toAxis(activity: ScheduledActivity, offset: number): ScheduledActivity {
  return offset === 0 ? activity : { ...activity, startMinutes: activity.startMinutes + offset * MINUTES_PER_DAY }
}

/** The inverse of `toAxis`: an axis activity back to its owner day's own minutes. */
export function toOwnDay(activity: ScheduledActivity): { offset: number; activity: ScheduledActivity } {
  const offset = ownerOffset(activity)
  return { offset, activity: offset === 0 ? activity : { ...activity, startMinutes: activity.startMinutes - offset * MINUTES_PER_DAY } }
}

/**
 * The page's activities, built from the three days it can touch. `days` maps
 * each offset (-1, 0, +1) to that calendar day's STORED list (own-day
 * minutes). Only what overlaps the window is returned, on the page's axis.
 */
export function windowFromDays(days: Partial<Record<WindowDayOffset, ActivityList>>): ScheduledActivity[] {
  const result: ScheduledActivity[] = []
  for (const offset of WINDOW_DAY_OFFSETS) {
    for (const activity of days[offset] ?? []) {
      const onAxis = toAxis(activity, offset)
      if (overlapsWindow(onAxis)) result.push(onAxis)
    }
  }
  return result
}

/** The page's activities grouped by the day that owns each, in that day's own minutes. */
export function splitByOwnerDay(activities: ActivityList): Map<number, ScheduledActivity[]> {
  const byDay = new Map<number, ScheduledActivity[]>()
  for (const activity of activities) {
    const { offset, activity: own } = toOwnDay(activity)
    byDay.set(offset, [...(byDay.get(offset) ?? []), own])
  }
  return byDay
}

/**
 * What to store for one calendar day after the page changed. `stored` is that
 * day's current stored list; `owned` is what the page now says that day owns
 * (own-day minutes). Anything stored that is NOT inside the window was never
 * loaded into the page, so it is kept untouched; anything inside the window is
 * replaced by `owned` — which is how edits, moves between days and deletes land.
 */
export function mergeWindowIntoDay(
  stored: ActivityList,
  offset: number,
  owned: ActivityList,
): ScheduledActivity[] {
  const outsideWindow = stored.filter((a) => !overlapsWindow(toAxis(a, offset)))
  return [...outsideWindow, ...owned]
}

/**
 * The date a quick-log entry starts on, as a day offset from the page's day,
 * given its `YYYY-MM-DD`. Returns `null` for a malformed date.
 */
export function dayOffsetFromPage(pageDateISO: string, startDateISO: string): number | null {
  return daysBetweenISO(pageDateISO, startDateISO)
}

/** The calendar date ISO for the day `offset` days from `pageDateISO`. */
export function dateISOAtOffset(pageDateISO: string, offset: number): string {
  return addDaysISO(pageDateISO, offset)
}

/**
 * The calendar day a clock time typed WITHOUT a date belongs to on this page:
 * the page's own day for 06:00-23:59, the next day for 00:00-05:59 (the Night
 * row's second half is the next morning).
 */
export function startDateForClock(pageDateISO: string, minutesOfDay: number): string {
  return dateISOAtOffset(pageDateISO, minutesOfDay < WINDOW_START ? 1 : 0)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-10-13` -> `"13 Oct"`. Fixed English short month, device-locale-independent. */
export function shortDateLabel(dateISO: string): string {
  const [, month, day] = dateISO.split('-').map(Number)
  return month >= 1 && month <= 12 ? `${day} ${MONTHS[month - 1]}` : dateISO
}

function clock(minutesOfDay: number): string {
  const m = ((minutesOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * An activity's range WITH dates, e.g. `"12 Oct 21:42 – 13 Oct 10:00"`, for one
 * that is not simply "today, same day" on this page (it started the day before,
 * is the next morning's, or crosses midnight). `null` for an ordinary one — the
 * caller keeps its plain `"16:00 – 16:45"` there.
 */
export function formatDatedRange(pageDateISO: string, startMinutes: number, durationMinutes: number): string | null {
  const endMinutes = startMinutes + durationMinutes
  if (startMinutes >= 0 && startMinutes < MINUTES_PER_DAY && endMinutes <= MINUTES_PER_DAY) return null
  const startDay = Math.floor(startMinutes / MINUTES_PER_DAY)
  const endDay = Math.floor(endMinutes / MINUTES_PER_DAY)
  return `${shortDateLabel(dateISOAtOffset(pageDateISO, startDay))} ${clock(startMinutes)} – ${shortDateLabel(dateISOAtOffset(pageDateISO, endDay))} ${clock(endMinutes)}`
}

/** The date label for a grid cell that belongs to the NEXT morning (cells 0..11 on the Night row's second half), else `null`. */
export function nextMorningLabel(pageDateISO: string, slot: number): string | null {
  return slot >= 0 && slot < 12 ? shortDateLabel(dateISOAtOffset(pageDateISO, 1)) : null
}
