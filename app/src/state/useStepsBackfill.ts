import { useEffect, useRef } from 'react'
import { apiListDailyValues, apiSetDailyValue } from '@/api/dailyValues'
import { listLocalDisplayValues, localOnlyDisplayValues } from '@/lib/displayValuesLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'

/**
 * One-time migration: Steps just moved from a client-only counter
 * (`lib/displayValuesLocalStore.ts`) onto the real, synced `public.
 * daily_values` table (`synced: true` in `domain/displayButtons.ts`; see the
 * migration that widened its `metric_key` CHECK constraint to allow
 * `'steps'`) — this closes the one confirmed data-loss gap found in a full
 * audit of the app. Anyone who logged Steps before this shipped may still
 * have values sitting ONLY in this browser's `localStorage`, never synced —
 * this hook pushes those up, once, without ever risking the two things that
 * matter here: losing data, and duplicating or clobbering it.
 *
 * Deliberately its own one-shot hook rather than folded into
 * `useDailyValue`'s Steps case: that hook reconciles only the SINGLE viewed
 * day against the server (the right shape for "what does today's button
 * show," and it already runs every time the viewed day changes). This needs
 * the FULL local history compared against the FULL server history — a
 * different shape that should run once per session, not repeat on every day
 * switch. `state/reconcileServerActivities.ts` was checked too, but it
 * solves a differently-shaped problem: MERGING two views of the same
 * mutable collection for render (walking a sync queue for in-flight
 * writes). This is a one-directional, one-time upload of rows the server
 * has never seen, with nothing in-flight to track — a plain
 * check-then-push is the whole job.
 *
 * Safety, matching the task's own constraints:
 *   - No local data at all -> the local list is empty -> returns before any
 *     network call. No-op, as it will be for most users going forward.
 *   - Idempotent -> a date is only ever pushed if the server's own list
 *     (fetched fresh, right before pushing) doesn't already have it. Running
 *     this again — another reload, another tab, this same effect re-firing —
 *     finds nothing left to push for any date that already landed, and
 *     safely retries any date whose push silently failed last time (the
 *     "check" step re-discovers it still missing).
 *   - Never clobbers a server value with a stale local one -> a date present
 *     on the server is left untouched here entirely, win or lose; this hook
 *     only ever CREATES a row the server doesn't have yet, never overwrites
 *     one it does.
 */
export function useStepsBackfill(): void {
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (!supabaseConfigured || hasRunRef.current) return
    hasRunRef.current = true

    // Nothing on this device to migrate — the common case for anyone who
    // never had Steps data before today, or already fully migrated.
    const localEntries = listLocalDisplayValues('steps')
    if (localEntries.length === 0) return

    let cancelled = false
    apiListDailyValues('steps').then((serverEntries) => {
      // Couldn't reach the server (no session, offline, request failed) —
      // never guess; just retry on the next load, same as every other
      // background sync in this app (rule 6).
      if (cancelled || serverEntries === null) return

      const serverDates = new Set(serverEntries.map((entry) => entry.localDate))
      for (const entry of localOnlyDisplayValues(localEntries, serverDates)) {
        void apiSetDailyValue('steps', entry.date, entry.value)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])
}
