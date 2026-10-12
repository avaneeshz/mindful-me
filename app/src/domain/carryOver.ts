import { MINUTES_PER_DAY } from '@/domain/scheduling'
import type { ActivityList, ScheduledActivity } from '@/domain/types'

/**
 * Midnight-crossing activities, seen from the day they spill INTO.
 *
 * Rule 2 stays exactly as decided: an activity is ONE row belonging to the
 * calendar day it started on. This module only derives a read-only view for
 * the next day's board — Sleep logged 10 PM → 6 AM yesterday shows up today as
 * 12 AM → 6 AM. Nothing here is ever stored or synced; it is recomputed from
 * the previous day's own activities each time.
 *
 * The view is expressed on the SAME minute axis as the viewed day: a carried
 * activity keeps its identity but its `startMinutes` goes negative (start
 * minus one day), so `end = start + duration` lands inside today. Every
 * existing scheduling rule (`covers`, `maxContiguousDuration`, `moveBounds`)
 * and the timeline's row clipping already handle that without special cases,
 * which is what makes the no-overlap rule hold across midnight for free.
 */

/** Activities from the previous day that are still running at today's 00:00, shifted onto today's axis. */
export function carryInFromPreviousDay(previousDay: ActivityList): ScheduledActivity[] {
  return previousDay
    .filter((a) => a.durationMinutes > 0 && a.startMinutes + a.durationMinutes > MINUTES_PER_DAY)
    .map((a) => ({ ...a, startMinutes: a.startMinutes - MINUTES_PER_DAY }))
}

/** The next day's activities on this day's axis (start plus one day), so a stretch running past midnight can be checked against them. */
export function nextDayOnThisAxis(nextDay: ActivityList): ScheduledActivity[] {
  return nextDay.filter((a) => a.durationMinutes > 0).map((a) => ({ ...a, startMinutes: a.startMinutes + MINUTES_PER_DAY }))
}

/**
 * Everything a new stretch starting on a given day must not overlap, on that
 * day's axis: the spill-in from the day before, the day itself, and the day
 * after (for a stretch that runs past midnight).
 */
export function placementNeighbourhood(
  carryIn: ActivityList,
  day: ActivityList,
  nextDay: ActivityList,
): ScheduledActivity[] {
  return [...carryIn, ...day, ...nextDayOnThisAxis(nextDay)]
}

/** One day of spill-in covers a stretch of up to 24h starting on the previous day; a quick log never exceeds that. */
export const QUICK_LOG_BOUNDS = { floor: -MINUTES_PER_DAY, horizon: MINUTES_PER_DAY * 2 } as const
