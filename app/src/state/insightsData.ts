/**
 * Phase 4 data-fetching: local-first (rule 6), always scoped to a bounded set
 * of calendar days (rule 8) — never the user's full history. Reuses exactly
 * the two primitives `BoardContext` already relies on for a single day
 * (`loadLocalActivities`, `apiListScheduledActivities`), just called once per
 * day in the requested window rather than once for a single `viewedDate`.
 *
 * This module does no aggregation itself — it only produces the
 * `DayActivities[]` shape `domain/insights.ts` consumes. Keeping the two
 * separate is what makes the arithmetic (`domain/insights.test.ts`) testable
 * with zero network/storage mocking.
 */
import { bucketByCalendarDay, type DayActivities, type DayTotals } from '@/domain/insights'

export type { DayActivities }
import type { CategoryId, ScheduledActivity } from '@/domain/types'
import { apiListScheduledActivities } from '@/api/scheduledActivities'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { loadLocalActivities } from './localPersistence'
import { localDateISO, localDayRange } from '@/lib/localTime'
import { reconcileActivities } from './reconcile'
import type { PendingEdit } from './syncQueue'

/** Local-first read for a run of calendar days — synchronous, never blocks (rule 6). */
export function loadLocalDayRange(days: Date[]): DayActivities[] {
  return days.map((date) => ({ date, activities: loadLocalActivities(date) ?? [] }))
}

/**
 * Server read for the same run of days. One `apiListScheduledActivities`
 * call per day (mirrors `BoardContext`'s own single-day reconciliation
 * exactly), because the RPC scopes by REAL instant, not by which day an
 * activity's wall-clock start belongs to (rule 3) — a midnight-crossing
 * activity's row is genuinely returned by BOTH its own day's query and the
 * following day's (its real span overlaps both). Ids are claimed in
 * chronological order so each row is attributed to exactly the day it first
 * appears in — its true home day — and never double-counted on the day
 * after.
 *
 * Returns `null` (never `[]`) if ANY day's read fails, so the caller can
 * fall back to local data for the whole window rather than silently mixing
 * a partially-synced range with local-only guesses for the rest.
 */
export async function fetchServerDayRange(days: Date[]): Promise<DayActivities[] | null> {
  const results = await Promise.all(
    days.map((date) => {
      const { start, end } = localDayRange(date)
      return apiListScheduledActivities(start, end)
    }),
  )
  if (results.some((result) => result === null)) return null

  const claimed = new Set<string>()
  return days.map((date, index) => {
    const activities = (results[index] as ScheduledActivity[]).filter((activity) => {
      if (claimed.has(activity.id)) return false
      claimed.add(activity.id)
      return true
    })
    return { date, activities }
  })
}

/**
 * Phase 5 — the same rule-7 resolution the board applies, for the read-only
 * Insights window. Without it, a day you logged offline (or whose edit is
 * still queued) would be silently under-reported the moment the server's own
 * answer arrived: `fetchServerDayRange` knows nothing about writes that have
 * not left the device yet.
 *
 * Conflicts are deliberately DISCARDED here rather than recorded. Insights is
 * a read surface; recording a losing edit is the board's job (it owns the
 * queue those edits live in), and doing it from two places would write the
 * same conflict twice.
 */
export function mergeUnsyncedLocalEdits(
  serverDays: DayActivities[],
  localDays: DayActivities[],
  pending: ReadonlyMap<string, PendingEdit>,
): DayActivities[] {
  if (pending.size === 0) return serverDays
  const localByDate = new Map(localDays.map((day) => [localDateISO(day.date), day.activities]))
  return serverDays.map((day) => ({
    date: day.date,
    activities: reconcileActivities({
      local: localByDate.get(localDateISO(day.date)) ?? [],
      server: day.activities,
      pending,
    }).activities,
  }))
}

export type InsightsView =
  | { kind: 'loading' }
  | { kind: 'error'; retry: () => void }
  | { kind: 'empty' }
  | { kind: 'ready'; days: DayTotals[] }

/**
 * Classifies fetched-so-far data into the one UX state to render. Local data
 * is shown the instant it's available and is NEVER blocked on the network
 * (rule 6) — "loading"/"error" only apply to the narrow case where there is
 * genuinely nothing to show yet and a configured backend might still have an
 * answer.
 */
export function classifyInsightsView(
  days: DayActivities[],
  categoryOf: (activity: ScheduledActivity) => CategoryId,
  opts: { syncing: boolean; syncFailed: boolean; retry: () => void },
): InsightsView {
  const hasAnyData = days.some((day) => day.activities.length > 0)

  if (!hasAnyData && supabaseConfigured && opts.syncing) return { kind: 'loading' }
  if (!hasAnyData && supabaseConfigured && opts.syncFailed) return { kind: 'error', retry: opts.retry }
  if (!hasAnyData) return { kind: 'empty' }

  return { kind: 'ready', days: bucketByCalendarDay(days, categoryOf) }
}
