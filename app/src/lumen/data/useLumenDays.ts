import { useEffect, useRef, useState } from 'react'
import { apiListScheduledActivitiesWithDates } from '@/api/scheduledActivities'
import { sameFlags, type ActivityRef, type CommitContext } from '@/domain/scheduling'
import type { ScheduledActivity } from '@/domain/types'
import { dateFromLocalDateISO } from '@/lib/localTime'
import { loadLocalActivities, saveLocalActivities } from '@/state/localPersistence'
import type { SyncIntent } from '@/state/sync'
import { activitySyncState, pendingActivityIds, pendingDeleteActivityIds, type SyncQueue } from '@/state/syncQueue'
import { useSyncQueue } from '@/state/useSyncQueue'
import { addDaysISO, lumenDayDates } from '@/lumen/domain/lumenDay'
import { reconcileDays } from '@/lumen/domain/reconcileDays'
import {
  applyRemove,
  applyWrite,
  findStored,
  planCreate,
  planUpdate,
  type CreatePlan,
  type PlanFailure,
  type UpdatePlan,
} from '@/lumen/domain/lumenWrites'

type ByDate = Record<string, ScheduledActivity[]>

export interface LumenDays {
  /** Every loaded calendar date's activities, keyed `YYYY-MM-DD` — at least the viewed Lumen day's three dates. */
  byDate: Readonly<ByDate>
  /** Every write not yet confirmed on the server — the same queue Classic shows. */
  syncQueue: SyncQueue
  retrySyncNow: () => void
  syncStateOf: (id: string) => 'synced' | 'pending' | 'failed'
  create: (input: { activity: ActivityRef; start: number; durationMinutes: number; context?: CommitContext }) => CreatePlan | PlanFailure
  update: (
    id: string,
    changes: { start?: number; durationMinutes?: number; path?: string[]; context?: CommitContext },
  ) => UpdatePlan | PlanFailure
  /** Removes an activity (recoverable server-side for 30 days, rule 11). Returns what `restore` needs to undo it. */
  remove: (id: string) => { date: string; activity: ScheduledActivity } | null
  restore: (removed: { date: string; activity: ScheduledActivity }) => void
  toggleComplete: (id: string) => void
  setReflection: (id: string, card: number, note: string) => void
  removeReflection: (id: string, card: number) => void
}

function loadDate(date: string): ScheduledActivity[] {
  return loadLocalActivities(dateFromLocalDateISO(date)) ?? []
}

/**
 * The real schedule behind one Lumen day — the Lumen counterpart of
 * Classic's `BoardProvider`, over the same storage, API and sync queue.
 *
 * Local-first (rule 6): each calendar date loads instantly from this
 * device's own cache (the same per-date cache Classic reads, so a switch
 * between interfaces shows the same data), then a background read of the
 * server — bounded to the three dates a Lumen day needs (rule 8) — merges in
 * through `reconcileDays`. Every write lands locally first, instantly, and
 * is then queued for the server; the UI never waits on the network.
 *
 * `disabled` (tests / previews) keeps everything in memory.
 */
export function useLumenDays(dayISO: string, disabled = false): LumenDays {
  const sync = useSyncQueue(disabled)
  const [byDate, setByDate] = useState<ByDate>(() => {
    const { prev, day, next } = lumenDayDates(dayISO)
    return disabled ? {} : { [prev]: loadDate(prev), [day]: loadDate(day), [next]: loadDate(next) }
  })
  // Always the latest map, for writes (which compute the next map
  // synchronously so they can persist and enqueue in the same step) and for
  // the async reconcile below, which must merge against whatever the person
  // did while the request was in flight.
  const byDateRef = useRef(byDate)
  byDateRef.current = byDate

  /** Replaces the given dates in the map, persisting exactly those — the one place local state changes. */
  function commit(changed: Record<string, ScheduledActivity[]>): void {
    if (Object.keys(changed).length === 0) return
    const next = { ...byDateRef.current, ...changed }
    byDateRef.current = next
    setByDate(next)
    if (disabled) return
    for (const [date, list] of Object.entries(changed)) saveLocalActivities(dateFromLocalDateISO(date), list)
  }

  // Newly viewed day: fill in any of its three dates not loaded yet, from
  // this device's cache.
  useEffect(() => {
    if (disabled) return
    const { prev, day, next } = lumenDayDates(dayISO)
    const missing = [prev, day, next].filter((date) => byDateRef.current[date] === undefined)
    if (missing.length === 0) return
    const loaded = Object.fromEntries(missing.map((date) => [date, loadDate(date)]))
    const merged = { ...byDateRef.current, ...loaded }
    byDateRef.current = merged
    setByDate(merged)
  }, [dayISO, disabled])

  // Background reconcile with the server, per viewed day. A failure (or no
  // backend configured — the API returns null) simply leaves the local data
  // in place; the app already works from that alone.
  useEffect(() => {
    if (disabled) return
    let cancelled = false
    const { prev, day, next } = lumenDayDates(dayISO)
    const dates = [prev, day, next]
    ;(async () => {
      const server = await apiListScheduledActivitiesWithDates(
        dateFromLocalDateISO(prev),
        dateFromLocalDateISO(addDaysISO(next, 1)),
      )
      if (cancelled || server === null) return
      const local = Object.fromEntries(dates.map((date) => [date, byDateRef.current[date] ?? loadDate(date)]))
      const merged = reconcileDays(
        dates,
        local,
        server,
        pendingActivityIds(sync.queueRef.current),
        pendingDeleteActivityIds(sync.queueRef.current),
      )
      commit(merged)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayISO, disabled])

  function enqueue(intents: SyncIntent[], date: string) {
    sync.enqueue(intents, date)
  }

  function create(input: Parameters<LumenDays['create']>[0]) {
    const plan = planCreate(dayISO, byDateRef.current, input)
    if (!plan.ok) return plan
    commit(applyWrite(byDateRef.current, plan.activity, plan.date))
    enqueue([{ kind: 'create', activity: plan.activity }], plan.date)
    return plan
  }

  function update(id: string, changes: Parameters<LumenDays['update']>[1]) {
    const plan = planUpdate(dayISO, byDateRef.current, id, changes)
    if (!plan.ok) return plan
    commit(applyWrite(byDateRef.current, plan.activity, plan.toDate, plan.fromDate))
    // Same split Classic's `deriveSyncIntents` makes: quality, symptoms,
    // notes and field selections ride inside `reschedule`; flags and
    // completion have their own calls.
    const intents: SyncIntent[] = [{ kind: 'reschedule', activity: plan.activity }]
    if (!sameFlags(plan.before.flags, plan.activity.flags)) intents.push({ kind: 'flags', activity: plan.activity })
    if (plan.before.status !== plan.activity.status) intents.push({ kind: 'status', activity: plan.activity })
    enqueue(intents, plan.toDate)
    return plan
  }

  function remove(id: string) {
    const stored = findStored(byDateRef.current, id)
    if (!stored) return null
    commit(applyRemove(byDateRef.current, id))
    enqueue([{ kind: 'delete', id }], stored.date)
    return stored
  }

  function restore(removed: { date: string; activity: ScheduledActivity }) {
    commit(applyWrite(byDateRef.current, removed.activity, removed.date))
    enqueue([{ kind: 'restore', id: removed.activity.id }], removed.date)
  }

  function toggleComplete(id: string) {
    const stored = findStored(byDateRef.current, id)
    if (!stored) return
    const activity: ScheduledActivity = {
      ...stored.activity,
      status: stored.activity.status === 'completed' ? 'planned' : 'completed',
    }
    commit(applyWrite(byDateRef.current, activity, stored.date))
    enqueue([{ kind: 'status', activity }], stored.date)
  }

  function setReflection(id: string, card: number, note: string) {
    const stored = findStored(byDateRef.current, id)
    if (!stored) return
    const others = stored.activity.reflections.filter((entry) => entry.card !== card)
    const activity = { ...stored.activity, reflections: [...others, { card, note }] }
    commit(applyWrite(byDateRef.current, activity, stored.date))
    enqueue([{ kind: 'addReflection', scheduledActivityId: id, card, note }], stored.date)
  }

  function removeReflection(id: string, card: number) {
    const stored = findStored(byDateRef.current, id)
    if (!stored) return
    const activity = { ...stored.activity, reflections: stored.activity.reflections.filter((entry) => entry.card !== card) }
    commit(applyWrite(byDateRef.current, activity, stored.date))
    enqueue([{ kind: 'removeReflection', scheduledActivityId: id, card }], stored.date)
  }

  return {
    byDate,
    syncQueue: sync.queue,
    retrySyncNow: sync.retryNow,
    syncStateOf: (id) => activitySyncState(sync.queue, id),
    create,
    update,
    remove,
    restore,
    toggleComplete,
    setReflection,
    removeReflection,
  }
}
