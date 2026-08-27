import { useEffect, useRef, useState } from 'react'
import { localDateISO } from '@/lib/localTime'
import {
  fetchServerDayRange,
  loadLocalDayRange,
  mergeUnsyncedLocalEdits,
  type DayActivities,
} from './insightsData'
import { useBoard } from './BoardContext'

export interface UseInsightsDaysResult {
  /** Local data instantly, silently upgraded to the server's view once it resolves. */
  days: DayActivities[]
  syncing: boolean
  syncFailed: boolean
  retry: () => void
}

/**
 * Local-first (rule 6) + background reconcile for an arbitrary, bounded
 * (rule 8) run of calendar days — the Insights-page counterpart to what
 * `BoardContext` already does for a single `viewedDate`. Local data renders
 * on the very first paint (the lazy `useState` initializer is synchronous);
 * the network is consulted in the background and only replaces it if it
 * actually answers.
 */
export function useInsightsDays(days: Date[]): UseInsightsDaysResult {
  const key = days.map(localDateISO).join(',')
  // Phase 5: writes still sitting in the offline queue are part of the truth
  // for this window, even though the server has not seen them yet.
  const { pendingSyncEdits } = useBoard()
  const [local, setLocal] = useState<DayActivities[]>(() => loadLocalDayRange(days))
  const [server, setServer] = useState<DayActivities[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const currentKeyRef = useRef(key)

  useEffect(() => {
    currentKeyRef.current = key
    const localDays = loadLocalDayRange(days)
    setLocal(localDays)
    setServer(null)
    setSyncFailed(false)
    setSyncing(true)
    let cancelled = false

    fetchServerDayRange(days).then((result) => {
      if (cancelled || currentKeyRef.current !== key) return
      setSyncing(false)
      if (result) setServer(mergeUnsyncedLocalEdits(result, localDays, pendingSyncEdits()))
      else setSyncFailed(true)
    })

    return () => {
      cancelled = true
    }
    // `days` is re-derived from `key` on every call; only a real window
    // change (or an explicit retry) should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryToken])

  return {
    days: server ?? local,
    syncing,
    syncFailed,
    retry: () => setRetryToken((token) => token + 1),
  }
}
