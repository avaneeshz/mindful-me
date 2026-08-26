/**
 * Phase 4 — Insights & aggregation. Pure derivation only, exactly like
 * `domain/scheduling.ts` and `domain/slots.ts`: no React, no fetching, no
 * knowledge of Supabase. The data-fetching side (`state/insightsData.ts`)
 * hands this module plain, already-local-first-or-server-scoped activity
 * lists per calendar day; everything here is arithmetic over that.
 *
 * The four Phase-4 features all reduce to two primitives:
 *
 *   bucketByCalendarDay(days, categoryOf) -> DayTotals[]   (one row per day)
 *   sumDayTotals(dayTotals)               -> RangeTotals   (fold N rows into one)
 *
 * "Daily/weekly time-per-category" and "free/occupied" are `sumDayTotals`
 * over a 1-day or 7-day window. "Planned vs. actual" is the `completion`
 * field already carried on every row. "Trends" is `bucketByCalendarDay`
 * itself (day granularity) or `bucketByCalendarWeek` (week granularity) —
 * the same rows, just not folded down to one.
 */
import type { ActivityList, CategoryId, ScheduledActivity } from './types'
import { MINUTES_PER_DAY, splitMinutesAcrossDays } from './scheduling'

/** Fixed order — mirrors `CATEGORIES` in `data/activities.ts` (mind, body, sports, nature, focus). */
export const CATEGORY_ORDER: CategoryId[] = ['mind', 'body', 'sports', 'nature', 'focus']

export type CategoryMinutes = Record<CategoryId, number>

function emptyCategoryMinutes(): CategoryMinutes {
  return { mind: 0, body: 0, sports: 0, nature: 0, focus: 0 }
}

/** A flag marker (`name: null`, `durationMinutes: 0`) carries no schedule time and is never aggregated. */
function isReal(activity: ScheduledActivity): boolean {
  return activity.name !== null && activity.durationMinutes > 0
}

export interface CompletionStats {
  totalCount: number
  completedCount: number
  totalMinutes: number
  completedMinutes: number
  /** `completedCount / totalCount`, or 0 when there was nothing planned — never NaN. */
  completionRate: number
}

function emptyCompletionStats(): CompletionStats {
  return { totalCount: 0, completedCount: 0, totalMinutes: 0, completedMinutes: 0, completionRate: 0 }
}

function finalizeCompletion(stats: CompletionStats): CompletionStats {
  return {
    ...stats,
    completionRate: stats.totalCount === 0 ? 0 : stats.completedCount / stats.totalCount,
  }
}

/**
 * One calendar day's real activities, exactly as `state/localPersistence.ts`
 * / `apiListScheduledActivities` already scope them — every `startMinutes` on
 * `activities` is relative to THIS day's own local midnight (rule 3), never
 * the window's start.
 */
export interface DayActivities {
  /** Local midnight of the calendar day. */
  date: Date
  activities: ActivityList
}

export interface DayTotals {
  date: Date
  minutesByCategory: CategoryMinutes
  occupiedMinutes: number
  completion: CompletionStats
  completionByCategory: Record<CategoryId, CompletionStats>
}

/**
 * Folds a chronological run of per-day activity lists into one totals row
 * per day — the one place rule 2 ("an activity belongs to the calendar day
 * it started on... daily/weekly aggregation queries split its MINUTES across
 * both calendar days") is actually applied. `days` must be contiguous,
 * chronological calendar days (each exactly one day after the previous).
 *
 * A midnight-crossing activity is still counted as exactly ONE planned/
 * completed unit — under its own home day, `days[i]` — only its MINUTES
 * spill into `days[i + 1]`'s totals. Callers that need a spillover landing
 * on the very FIRST reported day to be attributed correctly should include
 * one extra leading day (the day before the window) in `days` and discard
 * that leading row from the result, rather than dropping the attribution —
 * see `state/insightsData.ts`.
 */
export function bucketByCalendarDay(
  days: DayActivities[],
  categoryOf: (activity: ScheduledActivity) => CategoryId,
): DayTotals[] {
  return days.map((day, index) => {
    const minutesByCategory = emptyCategoryMinutes()
    const completionByCategory: Record<CategoryId, CompletionStats> = {
      mind: emptyCompletionStats(),
      body: emptyCompletionStats(),
      sports: emptyCompletionStats(),
      nature: emptyCompletionStats(),
      focus: emptyCompletionStats(),
    }
    let completion = emptyCompletionStats()
    let occupiedMinutes = 0

    function absorbMinutes(category: CategoryId, minutes: number) {
      if (minutes <= 0) return
      minutesByCategory[category] += minutes
      occupiedMinutes += minutes
    }

    function absorbUnit(activity: ScheduledActivity) {
      const category = categoryOf(activity)
      completion = {
        ...completion,
        totalCount: completion.totalCount + 1,
        totalMinutes: completion.totalMinutes + activity.durationMinutes,
        completedCount: completion.completedCount + (activity.status === 'completed' ? 1 : 0),
        completedMinutes: completion.completedMinutes + (activity.status === 'completed' ? activity.durationMinutes : 0),
      }
      const byCat = completionByCategory[category]
      completionByCategory[category] = {
        ...byCat,
        totalCount: byCat.totalCount + 1,
        totalMinutes: byCat.totalMinutes + activity.durationMinutes,
        completedCount: byCat.completedCount + (activity.status === 'completed' ? 1 : 0),
        completedMinutes: byCat.completedMinutes + (activity.status === 'completed' ? activity.durationMinutes : 0),
      }
    }

    // This day's own activities: counted as a unit, minutes clipped to
    // whatever falls before this day's own midnight (the rest is tomorrow's).
    for (const activity of day.activities) {
      if (!isReal(activity)) continue
      const { sameDayMinutes } = splitMinutesAcrossDays(activity.startMinutes, activity.durationMinutes)
      absorbMinutes(categoryOf(activity), sameDayMinutes)
      absorbUnit(activity)
    }

    // Yesterday's spillover: minutes only, never counted as a unit again —
    // it was already counted once, under its own home day.
    const previous = index > 0 ? days[index - 1] : null
    if (previous) {
      for (const activity of previous.activities) {
        if (!isReal(activity)) continue
        const { nextDayMinutes } = splitMinutesAcrossDays(activity.startMinutes, activity.durationMinutes)
        absorbMinutes(categoryOf(activity), nextDayMinutes)
      }
    }

    return {
      date: day.date,
      minutesByCategory,
      occupiedMinutes,
      completion: finalizeCompletion(completion),
      completionByCategory: Object.fromEntries(
        CATEGORY_ORDER.map((id) => [id, finalizeCompletion(completionByCategory[id])]),
      ) as Record<CategoryId, CompletionStats>,
    }
  })
}

export interface RangeTotals {
  minutesByCategory: CategoryMinutes
  completionByCategory: Record<CategoryId, CompletionStats>
  occupiedMinutes: number
  freeMinutes: number
  totalMinutes: number
  completion: CompletionStats
}

function addCompletion(a: CompletionStats, b: CompletionStats): CompletionStats {
  return {
    totalCount: a.totalCount + b.totalCount,
    completedCount: a.completedCount + b.completedCount,
    totalMinutes: a.totalMinutes + b.totalMinutes,
    completedMinutes: a.completedMinutes + b.completedMinutes,
    completionRate: 0, // recomputed by the caller once both sides are folded in
  }
}

/**
 * Folds N day rows into one range total — daily/weekly category totals and
 * free/occupied are both this, over a 1-day or 7-day `days` array. Rule 1 (no
 * overlap) is what makes a plain sum of `occupiedMinutes` safe: activities
 * within a day never overlap, and different days are disjoint by
 * construction, so nothing here can double-count.
 */
export function sumDayTotals(days: DayTotals[]): RangeTotals {
  const minutesByCategory = emptyCategoryMinutes()
  const completionByCategory: Record<CategoryId, CompletionStats> = {
    mind: emptyCompletionStats(),
    body: emptyCompletionStats(),
    sports: emptyCompletionStats(),
    nature: emptyCompletionStats(),
    focus: emptyCompletionStats(),
  }
  let completion = emptyCompletionStats()
  let occupiedMinutes = 0

  for (const day of days) {
    for (const id of CATEGORY_ORDER) {
      minutesByCategory[id] += day.minutesByCategory[id]
      completionByCategory[id] = addCompletion(completionByCategory[id], day.completionByCategory[id])
    }
    completion = addCompletion(completion, day.completion)
    occupiedMinutes += day.occupiedMinutes
  }

  const totalMinutes = days.length * MINUTES_PER_DAY
  return {
    minutesByCategory,
    completionByCategory: Object.fromEntries(
      CATEGORY_ORDER.map((id) => [id, finalizeCompletion(completionByCategory[id])]),
    ) as Record<CategoryId, CompletionStats>,
    occupiedMinutes,
    freeMinutes: Math.max(0, totalMinutes - occupiedMinutes),
    totalMinutes,
    completion: finalizeCompletion(completion),
  }
}

export interface WeekTotals extends RangeTotals {
  /** Local midnight of the week's first day (Sunday — see `domain/calendar.ts` `startOfWeek`). */
  weekStart: Date
}

/**
 * Groups a chronological day-totals series into 7-day weeks, for the
 * week-granularity trend view. `days` is expected to already start on a week
 * boundary (`startOfWeek`) — a trailing partial week (fewer than 7 days left)
 * is dropped rather than reported as a short week, so every bar in the trend
 * chart represents the same real span.
 */
export function bucketByCalendarWeek(days: DayTotals[]): WeekTotals[] {
  const weeks: WeekTotals[] = []
  for (let i = 0; i + 7 <= days.length; i += 7) {
    const chunk = days.slice(i, i + 7)
    weeks.push({ weekStart: chunk[0].date, ...sumDayTotals(chunk) })
  }
  return weeks
}

/** "0m" / "45m" / "1h" / "1h 30m" — never negative; inputs are already whole minutes. */
export function formatDurationMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
