import type { ScheduledActivity } from '@/domain/types'
import { reconcileServerActivities } from '@/state/reconcileServerActivities'

/**
 * Merges the server's view of several calendar dates into the local one in
 * ONE pass, through the exact same `reconcileServerActivities` Classic uses
 * for its single day (Bug A: an unconfirmed local write always survives a
 * server response that predates it).
 *
 * One pass rather than one call per date because Lumen edits can move an
 * activity across midnight (from the 12th to the 13th). Until that
 * reschedule is confirmed the server still has it on the 12th; a per-date
 * merge of the 12th wouldn't see the local copy (now on the 13th) and would
 * put the server's stale one back — a duplicate. Merging all dates together
 * finds the local copy wherever it now lives, and keeps it there.
 */
export function reconcileDays(
  dates: readonly string[],
  local: Readonly<Record<string, readonly ScheduledActivity[] | undefined>>,
  server: readonly { activity: ScheduledActivity; localDate: string }[],
  pendingIds: ReadonlySet<string>,
  pendingDeleteIds: ReadonlySet<string>,
): Record<string, ScheduledActivity[]> {
  const wanted = new Set(dates)
  const dateOf = new Map<ScheduledActivity, string>()

  const localList: ScheduledActivity[] = []
  for (const date of dates) {
    for (const activity of local[date] ?? []) {
      dateOf.set(activity, date)
      localList.push(activity)
    }
  }
  const serverList: ScheduledActivity[] = []
  for (const row of server) {
    if (!wanted.has(row.localDate)) continue
    dateOf.set(row.activity, row.localDate)
    serverList.push(row.activity)
  }

  const merged = reconcileServerActivities(localList, serverList, pendingIds, pendingDeleteIds)

  const result: Record<string, ScheduledActivity[]> = Object.fromEntries(dates.map((date) => [date, []]))
  for (const activity of merged) {
    const date = dateOf.get(activity)
    if (date) result[date].push(activity)
  }
  for (const date of dates) result[date].sort((a, b) => a.startMinutes - b.startMinutes)
  return result
}
