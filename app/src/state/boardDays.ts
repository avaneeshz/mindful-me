import { axisToStorage, dayDates, storageToAxis } from '@/domain/dayAxis'
import type { ScheduledActivity } from '@/domain/types'
import type { SyncIntent } from './sync'

/**
 * Classic's board ↔ storage boundary for the 06:00 → 06:00 day (see
 * `domain/dayAxis.ts`). Pure — no React, no storage.
 *
 * The board (`BoardState.activities`) is ONE list on the viewed day's
 * continuous axis: everything stored under D-1, D and D+1, each with its
 * `startMinutes` measured from D's midnight. That is what lets the reducer
 * and the shared scheduling rules work unchanged across midnight. Storage
 * and sync stay per calendar date (rule 2): these functions translate in
 * both directions.
 *
 * Unlike Lumen's `toAxis`, zero-length legacy flag markers are KEPT — Classic
 * still shows them, and dropping them here would erase them from the device
 * on the next save.
 */

export type ActivitiesByDate = Record<string, ScheduledActivity[]>

/** The three calendar dates the board for `dayISO` holds, in axis order. */
export function boardDates(dayISO: string): string[] {
  const { prev, day, next } = dayDates(dayISO)
  return [prev, day, next]
}

/** Every activity stored under the board's three dates, placed on `dayISO`'s axis and sorted by start. */
export function boardActivitiesFromDates(
  dayISO: string,
  byDate: Readonly<Record<string, readonly ScheduledActivity[] | undefined>>,
): ScheduledActivity[] {
  const list: ScheduledActivity[] = []
  for (const date of boardDates(dayISO)) {
    for (const activity of byDate[date] ?? []) {
      list.push({ ...activity, startMinutes: storageToAxis(dayISO, date, activity.startMinutes) })
    }
  }
  return list.sort((a, b) => a.startMinutes - b.startMinutes)
}

/** Where one board activity is stored: its calendar date, and itself with `startMinutes` from that date's midnight. */
export function storedForm(dayISO: string, activity: ScheduledActivity): { date: string; activity: ScheduledActivity } {
  const { date, startMinutes } = axisToStorage(dayISO, activity.startMinutes)
  return { date, activity: { ...activity, startMinutes } }
}

/**
 * The board split back into calendar dates. Always has a key for each of the
 * board's three dates (an empty list means "nothing stored there any more",
 * which must be persisted too, e.g. after a delete).
 */
export function boardActivitiesToDates(dayISO: string, activities: readonly ScheduledActivity[]): ActivitiesByDate {
  const byDate: ActivitiesByDate = Object.fromEntries(boardDates(dayISO).map((date) => [date, []]))
  for (const activity of activities) {
    const stored = storedForm(dayISO, activity)
    ;(byDate[stored.date] ??= []).push(stored.activity)
  }
  for (const list of Object.values(byDate)) list.sort((a, b) => a.startMinutes - b.startMinutes)
  return byDate
}

/**
 * Turns board-level sync intents (axis minutes) into per-date batches the
 * sync queue can run: an intent that carries an activity is converted to its
 * stored form and queued against the date it is stored under (the date the
 * server anchors `startMinutes` to). An id-only intent (delete, restore,
 * reflections) goes with the date its activity is stored under.
 */
export function storedSyncBatches(
  dayISO: string,
  intents: readonly SyncIntent[],
  boardBefore: readonly ScheduledActivity[],
  boardAfter: readonly ScheduledActivity[],
): Array<{ date: string; intents: SyncIntent[] }> {
  const batches = new Map<string, SyncIntent[]>()
  const add = (date: string, intent: SyncIntent) => {
    const list = batches.get(date)
    if (list) list.push(intent)
    else batches.set(date, [intent])
  }
  const dateOfId = (id: string): string => {
    const activity = boardAfter.find((a) => a.id === id) ?? boardBefore.find((a) => a.id === id)
    return activity ? storedForm(dayISO, activity).date : dayISO
  }

  for (const intent of intents) {
    switch (intent.kind) {
      case 'create':
      case 'reschedule':
      case 'flags':
      case 'status': {
        const stored = storedForm(dayISO, intent.activity)
        add(stored.date, { ...intent, activity: stored.activity })
        break
      }
      case 'delete':
      case 'restore':
        add(dateOfId(intent.id), intent)
        break
      case 'addReflection':
      case 'removeReflection':
        add(dateOfId(intent.scheduledActivityId), intent)
        break
    }
  }
  return [...batches].map(([date, list]) => ({ date, intents: list }))
}
