import { useEffect, useState } from 'react'
import { apiListScheduledActivitiesWithDates } from '@/api/scheduledActivities'
import type { ScheduledActivity } from '@/domain/types'
import { dateFromLocalDateISO } from '@/lib/localTime'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { loadLocalActivities } from '@/state/localPersistence'
import { pendingActivityIds } from '@/state/syncQueue'
import { loadSyncQueue } from '@/state/syncQueueStorage'
import { addDaysISO, daysBetweenISO, toAxis, type AxisActivity } from '@/lumen/domain/lumenDay'

type ByDate = Record<string, ScheduledActivity[]>

export type RangeStatus = 'local' | 'synced' | 'offline'

function datesBetween(fromISO: string, toISO: string): string[] {
  const count = Math.max(0, daysBetweenISO(fromISO, toISO))
  return Array.from({ length: count }, (_, i) => addDaysISO(fromISO, i))
}

/**
 * Read-only activities for a bounded run of Lumen days — the month grid,
 * Calendar and Insights. Rule 8: never the full history, only
 * [firstDay − 1, lastDay + 1] (the neighbours a Lumen day's 6 AM → 6 AM
 * window needs).
 *
 * Local-first like everything else: this device's per-date cache shows at
 * once, then one bounded server read replaces it for the dates the server
 * returned. Nothing here writes; the Today screen owns writes.
 *
 * `lumenDays(day)` is the day's axis, ready for the Lumen day helpers.
 */
export function useLumenRange(firstDayISO: string, dayCount: number, refreshKey: unknown = null) {
  const fromISO = addDaysISO(firstDayISO, -1)
  const toISO = addDaysISO(firstDayISO, dayCount + 1)
  const [state, setState] = useState<{ key: string; byDate: ByDate; status: RangeStatus }>(() => ({
    key: `${fromISO}/${toISO}`,
    byDate: loadLocal(fromISO, toISO),
    status: 'local',
  }))

  useEffect(() => {
    const key = `${fromISO}/${toISO}`
    setState({ key, byDate: loadLocal(fromISO, toISO), status: 'local' })
    let cancelled = false
    apiListScheduledActivitiesWithDates(dateFromLocalDateISO(fromISO), dateFromLocalDateISO(toISO)).then((rows) => {
      if (cancelled) return
      if (rows === null) {
        // No account at all (local-only mode) isn't "offline" — this device IS the whole record.
        const status: RangeStatus = supabaseConfigured ? 'offline' : 'local'
        setState((s) => (s.key === key ? { ...s, status } : s))
        return
      }
      const server: ByDate = Object.fromEntries(datesBetween(fromISO, toISO).map((d) => [d, []]))
      for (const row of rows) server[row.localDate]?.push(row.activity)
      // Keep this device's own entries that are still waiting to sync (the
      // server can't know them yet); anything else missing from the server
      // was deleted elsewhere and stays gone.
      const pending = pendingActivityIds(loadSyncQueue())
      setState((s) => {
        if (s.key !== key) return s
        const merged: ByDate = { ...server }
        for (const [date, local] of Object.entries(s.byDate)) {
          const known = new Set((server[date] ?? []).map((a) => a.id))
          const unsynced = local.filter((a) => !known.has(a.id) && pending.has(a.id))
          if (unsynced.length > 0) merged[date] = [...(server[date] ?? []), ...unsynced]
        }
        return { key, byDate: merged, status: 'synced' }
      })
    })
    return () => {
      cancelled = true
    }
  }, [fromISO, toISO, refreshKey])

  return {
    byDate: state.byDate,
    status: state.status,
    lumenDay: (day: string): AxisActivity[] => toAxis(day, state.byDate),
  }
}

function loadLocal(fromISO: string, toISO: string): ByDate {
  return Object.fromEntries(
    datesBetween(fromISO, toISO).map((d) => [d, loadLocalActivities(dateFromLocalDateISO(d)) ?? []]),
  )
}
