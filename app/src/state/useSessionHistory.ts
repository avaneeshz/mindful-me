import { useEffect, useRef, useState } from 'react'
import { apiListScheduledActivitiesWithDates, type ScheduledActivityWithDate } from '@/api/scheduledActivities'
import type { ScheduledActivity } from '@/domain/types'
import { localDateISO } from '@/lib/localTime'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type SessionHistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * One past session, tagged with the real calendar day it was logged on.
 * `ScheduledActivity.startMinutes` alone is minutes since ITS OWN midnight —
 * it can't tell two different days apart once a query spans more than one
 * (rule 2), so the day rides along here instead of being dropped the way
 * `apiListScheduledActivities`'s single-day callers can afford to.
 */
export interface PastSession {
  activity: ScheduledActivity
  localDate: string
}

export interface UseSessionHistoryResult {
  /** Sessions before `viewedDate`, most recent first. Never includes `viewedDate` itself — that's `SessionHistory`'s own "Recent" list. */
  sessions: PastSession[]
  status: SessionHistoryStatus
  error: string | null
}

/** How far back "History" looks — a bounded window (rule 8), never the user's full history. */
const HISTORY_WINDOW_DAYS = 90

/**
 * Pure: narrows a set of scheduled-activity rows (spanning any number of
 * calendar days) down to past sessions for one quick-log catalog name,
 * excluding `excludeDate` (the day already shown as "Recent"), sorted
 * most-recent first (by real calendar day, then by time of day within a
 * day). Split out from the fetch effect below so it's testable without a
 * `window`/network round-trip — the same "pure logic separated from its I/O
 * wrapper" shape `lib/displayValuesLocalStore.ts`'s own
 * `sortDisplayValueHistory` already establishes.
 */
export function selectPastSessions(
  rows: readonly ScheduledActivityWithDate[],
  quickLogName: string,
  excludeDate: string,
): PastSession[] {
  return rows
    .filter((row) => row.activity.name === quickLogName && row.localDate !== excludeDate)
    .slice()
    .sort((a, b) => {
      if (a.localDate !== b.localDate) return a.localDate < b.localDate ? 1 : -1
      return b.activity.startMinutes - a.activity.startMinutes
    })
}

/**
 * Past sessions for one quick-log catalog name (Vipassana/Exercise/
 * Breathing/Sleep) — the History half of `DisplayValueButton`'s
 * `SessionHistory`. `viewedDate`'s own sessions already live in the board
 * (`activities` prop) and are never re-fetched here.
 *
 * `active` gates the fetch to only once History is actually expanded — never
 * on every popover open — mirroring `useDisplayValueHistory`'s own `active`
 * gating. The fetch re-runs if `viewedDate` moves to a different calendar
 * day while this component stays mounted (the header's date picker doesn't
 * remount it), since the window and the "already shown in Recent" exclusion
 * are both relative to `viewedDate`.
 */
export function useSessionHistory(
  quickLogName: string,
  viewedDate: Date,
  active: boolean,
): UseSessionHistoryResult {
  const [sessions, setSessions] = useState<PastSession[]>([])
  const [status, setStatus] = useState<SessionHistoryStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  // Tracks which day's window has already been fetched, rather than a plain
  // boolean, so navigating to a different viewed day re-fetches instead of
  // serving a stale window forever.
  const fetchedForRef = useRef<string | null>(null)

  const dayKey = localDateISO(viewedDate)

  useEffect(() => {
    if (!active || fetchedForRef.current === dayKey) return

    if (!supabaseConfigured) {
      // No source for other-day sessions at all in local-only mode — settle
      // to ready with an empty list, same graceful contract
      // `useNoteEntries`/`useDisplayValueHistory` already follow, rather than
      // surfacing an error for something that was never configured.
      fetchedForRef.current = dayKey
      setSessions([])
      setStatus('ready')
      return
    }

    fetchedForRef.current = dayKey
    let cancelled = false
    setStatus('loading')
    setError(null)

    // Bounded window (rule 8): the HISTORY_WINDOW_DAYS days strictly before
    // `viewedDate` — the exclusive upper bound already keeps `viewedDate`
    // itself out of the result.
    const rangeEnd = new Date(viewedDate.getFullYear(), viewedDate.getMonth(), viewedDate.getDate())
    const rangeStart = new Date(rangeEnd)
    rangeStart.setDate(rangeStart.getDate() - HISTORY_WINDOW_DAYS)

    apiListScheduledActivitiesWithDates(rangeStart, rangeEnd).then((server) => {
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load your history — showing what’s available on this device.')
        return
      }
      setSessions(selectPastSessions(server, quickLogName, dayKey))
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, dayKey, quickLogName, viewedDate])

  return { sessions, status, error }
}
