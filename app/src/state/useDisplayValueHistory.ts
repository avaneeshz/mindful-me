import { useCallback, useEffect, useRef, useState } from 'react'
import { apiListDailyValues, apiSetDailyValue } from '@/api/dailyValues'
import type { DisplayButtonKey } from '@/domain/displayButtons'
import { listLocalDisplayValues, saveDisplayValue, type DisplayValueHistoryEntry } from '@/lib/displayValuesLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type DisplayValueHistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseDisplayValueHistoryResult {
  /** Every day this button has a value for, most recent first. */
  entries: DisplayValueHistoryEntry[]
  status: DisplayValueHistoryStatus
  error: string | null
  /** The date currently being saved, if any — rule 9's guard, scoped per-row since a history list has many independent rows. */
  pendingDate: string | null
  /** Replaces one past day's value in place — the same "re-entering REPLACES the day's value" contract `useDailyValue.setValue` already has, generalized to an arbitrary day instead of only `dayKey`. */
  updateEntry: (date: string, value: number) => Promise<void>
}

/**
 * "Past days' values, each inline-editable via the existing setter,
 * prefilled" (BACKLOG.md) — the history view for a day-value display button
 * (Steps, Protein; never a `quickLogName` button — see
 * `DisplayValueButton`'s own `SessionHistory` for that shape instead).
 *
 * Reuses the SAME local-first store `useDailyValue`/the plain local-counter
 * path already write through (`lib/displayValuesLocalStore.ts`) rather than
 * a parallel cache — that store already holds one row per calendar day
 * forever (nothing prunes it), so it is already this button's own history,
 * for BOTH a synced button (Protein) and a local-only one (Steps). A synced
 * button additionally reconciles against the server's authoritative list
 * once per time this history is opened, mirroring `useDailyValue`'s own
 * "server wins once it answers" shape; a local-only button (`metricKey`
 * irrelevant) never issues a request at all — Steps' history is, and stays,
 * device-only, the same explicitly-scoped exception `Steps` already is
 * everywhere else in this app (see `domain/displayButtons.ts`'s own doc
 * comment). Flagged rather than silently decided: putting Steps on
 * `daily_values` too is a real architecture call, not something to make by
 * building its history view a particular way — out of scope here.
 */
export function useDisplayValueHistory(
  buttonKey: DisplayButtonKey,
  metricKey: string,
  synced: boolean,
  active: boolean,
): UseDisplayValueHistoryResult {
  const [entries, setEntries] = useState<DisplayValueHistoryEntry[]>(() => listLocalDisplayValues(buttonKey))
  const [status, setStatus] = useState<DisplayValueHistoryStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pendingDate, setPendingDate] = useState<string | null>(null)
  const hasFetchedRef = useRef(false)

  // Re-read the local cache every time this history is opened — it may have
  // changed since the last time (a day-value edit made elsewhere on this
  // device, e.g. via the plain setter on a different viewed day).
  useEffect(() => {
    if (!active) return
    setEntries(listLocalDisplayValues(buttonKey))
  }, [active, buttonKey])

  useEffect(() => {
    if (!active || !synced || hasFetchedRef.current) return
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    hasFetchedRef.current = true
    let cancelled = false
    setStatus('loading')
    apiListDailyValues(metricKey).then((server) => {
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load your saved history — showing what’s saved on this device.')
        return
      }
      // Server wins once it answers — same reconciliation shape
      // `useDailyValue`/`useNoteEntries` already follow. Every server row is
      // folded into the SAME local cache (not a separate list) so the plain
      // per-day setter and this history view can never disagree about what
      // a given day's value is.
      for (const row of server) {
        saveDisplayValue(buttonKey, row.localDate, row.value)
      }
      setEntries(listLocalDisplayValues(buttonKey))
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, synced, metricKey, buttonKey])

  const updateEntry = useCallback(
    async (date: string, value: number): Promise<void> => {
      setPendingDate(date)
      setError(null)

      // Local-first (rule 6): visible and durable on this device before any
      // network round-trip even starts.
      saveDisplayValue(buttonKey, date, value)
      setEntries(listLocalDisplayValues(buttonKey))

      if (synced && supabaseConfigured) {
        const server = await apiSetDailyValue(metricKey, date, value)
        if (server === null) {
          setError('Saved on this device — will sync once you’re back online.')
        }
      }

      setPendingDate(null)
    },
    [buttonKey, metricKey, synced],
  )

  return { entries, status, error, pendingDate, updateEntry }
}
