import {
  commitSchedule,
  validateSchedule,
  type ActivityRef,
  type CommitContext,
} from '@/domain/scheduling'
import type { ScheduledActivity } from '@/domain/types'
import { axisToStorage, LUMEN_AXIS_BOUNDS, LUMEN_DAY_END, LUMEN_DAY_START, schedulingList, toAxis } from './lumenDay'

/**
 * Lumen's write planning — pure, so every rule is tested without React.
 *
 * Each plan validates on the Lumen day's axis with the SAME shared
 * `validateSchedule` Classic uses (rules 1 and 13), then says where the
 * result is stored: the calendar date it starts on (rule 2), with
 * `startMinutes` from that date's midnight. Applying a plan (local write +
 * sync intent) is `useLumenDays`' job.
 */

export type ActivitiesByDate = Readonly<Record<string, readonly ScheduledActivity[] | undefined>>

export type PlanFailure = { ok: false; reason: 'occupied' | 'too-long' | 'outside-day' | 'missing'; maxDuration: number }

export type CreatePlan = { ok: true; date: string; activity: ScheduledActivity }

export type UpdatePlan = {
  ok: true
  /** The date it was stored under before, and the date it is stored under now — different when an edit moves it across midnight. */
  fromDate: string
  toDate: string
  before: ScheduledActivity
  activity: ScheduledActivity
}

/** Where an activity is currently stored, if it is in any of the loaded dates. */
export function findStored(byDate: ActivitiesByDate, id: string): { date: string; activity: ScheduledActivity } | null {
  for (const [date, list] of Object.entries(byDate)) {
    const activity = list?.find((a) => a.id === id)
    if (activity) return { date, activity }
  }
  return null
}

/**
 * A new activity starting at `start` on `dayISO`'s axis. A new entry must
 * start inside the Lumen day (06:00 → 06:00); it may run past its end.
 */
export function planCreate(
  dayISO: string,
  byDate: ActivitiesByDate,
  input: { activity: ActivityRef; start: number; durationMinutes: number; context?: CommitContext },
): CreatePlan | PlanFailure {
  if (input.start < LUMEN_DAY_START || input.start >= LUMEN_DAY_END) {
    return { ok: false, reason: 'outside-day', maxDuration: 0 }
  }
  const list = schedulingList(toAxis(dayISO, byDate))
  const candidate = { id: null, activity: input.activity, startMinutes: input.start, durationMinutes: input.durationMinutes }
  const check = validateSchedule(candidate, list, LUMEN_AXIS_BOUNDS)
  if (!check.ok) return check
  const { date, startMinutes } = axisToStorage(dayISO, input.start)
  const activity = commitSchedule({ ...candidate, startMinutes }, input.context)
  return { ok: true, date, activity }
}

/**
 * An edit to an existing activity: any of its time, its drill-down path, or
 * its details. Everything not in `changes` is carried forward — including
 * completion (rule 4: editing time never silently clears it) and the
 * timezone it was logged in (rule 3). `start` is on `dayISO`'s axis.
 */
export function planUpdate(
  dayISO: string,
  byDate: ActivitiesByDate,
  id: string,
  changes: { start?: number; durationMinutes?: number; path?: string[]; context?: CommitContext },
): UpdatePlan | PlanFailure {
  const stored = findStored(byDate, id)
  if (!stored) return { ok: false, reason: 'missing', maxDuration: 0 }
  const before = stored.activity
  const axis = toAxis(dayISO, byDate)
  const currentStart = axis.find((item) => item.activity.id === id)?.start
  if (currentStart === undefined) return { ok: false, reason: 'missing', maxDuration: 0 }

  const start = changes.start ?? currentStart
  const durationMinutes = changes.durationMinutes ?? before.durationMinutes
  const timeChanged = start !== currentStart || durationMinutes !== before.durationMinutes
  if (timeChanged) {
    if (start < LUMEN_DAY_START || start >= LUMEN_DAY_END) return { ok: false, reason: 'outside-day', maxDuration: 0 }
    const candidate = { id, activity: null, startMinutes: start, durationMinutes }
    const check = validateSchedule(candidate, schedulingList(axis), LUMEN_AXIS_BOUNDS)
    if (!check.ok) return check
  }

  const { date: toDate, startMinutes } = axisToStorage(dayISO, start)
  const activity: ScheduledActivity = {
    ...before,
    ...changes.context,
    id: before.id,
    name: before.name,
    path: changes.path ?? before.path,
    startMinutes,
    durationMinutes,
    status: changes.context?.status ?? before.status,
    timezone: before.timezone,
  }
  return { ok: true, fromDate: stored.date, toDate, before, activity }
}

/**
 * The byDate map after an activity is written to `date` (and taken out of
 * `fromDate` if it moved). Returns only the dates that changed, so the
 * caller persists exactly those.
 */
export function applyWrite(
  byDate: ActivitiesByDate,
  activity: ScheduledActivity,
  date: string,
  fromDate: string | null = null,
): Record<string, ScheduledActivity[]> {
  const changed: Record<string, ScheduledActivity[]> = {}
  if (fromDate && fromDate !== date) {
    changed[fromDate] = (byDate[fromDate] ?? []).filter((a) => a.id !== activity.id)
  }
  const target = (byDate[date] ?? []).filter((a) => a.id !== activity.id)
  changed[date] = [...target, activity].sort((a, b) => a.startMinutes - b.startMinutes)
  return changed
}

/** The byDate change for removing an activity from wherever it is stored. */
export function applyRemove(byDate: ActivitiesByDate, id: string): Record<string, ScheduledActivity[]> {
  const stored = findStored(byDate, id)
  if (!stored) return {}
  return { [stored.date]: (byDate[stored.date] ?? []).filter((a) => a.id !== id) }
}
