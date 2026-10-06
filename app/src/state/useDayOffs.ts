import { useCallback, useEffect, useState } from 'react'
import { apiClearDayOff, apiListDayOffs, apiSetDayOff } from '@/api/dayOffs'
import { dayOffWindowForMonth, mergeDayOffWindow, normalizeDayOffReason, type DayOff } from '@/domain/dayOffs'
import { deviceTimezone } from '@/lib/localTime'
import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import { supabaseConfigured } from '@/lib/supabaseClient'

const STORAGE_KEY = 'mindful-me:day-offs'
/** Writes that haven't reached the server yet, keyed by day — retried before every fetch. */
const OUTBOX_KEY = 'mindful-me:day-offs:outbox'

type OutboxEntry = { op: 'set'; timeZone: string; reason: string | null } | { op: 'clear' }

function loadRecord<T>(key: string): Record<string, T> {
  const stored = readStoredJSON(key)
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, T>) : {}
}

function loadCache(): Record<string, DayOff> {
  return loadRecord<DayOff>(STORAGE_KEY)
}

function setOutbox(localDate: string, entry: OutboxEntry | null): void {
  const outbox = loadRecord<OutboxEntry>(OUTBOX_KEY)
  if (entry) outbox[localDate] = entry
  else delete outbox[localDate]
  writeStoredJSON(OUTBOX_KEY, outbox)
}

/** Replays every queued write; each one that lands leaves the outbox. */
async function flushOutbox(): Promise<void> {
  const outbox = loadRecord<OutboxEntry>(OUTBOX_KEY)
  for (const [localDate, entry] of Object.entries(outbox)) {
    const ok =
      entry.op === 'set'
        ? (await apiSetDayOff(localDate, entry.timeZone, entry.reason)) !== null
        : await apiClearDayOff(localDate)
    if (ok) setOutbox(localDate, null)
  }
}

/** Server rows for the window, with any still-queued local write laid back on top so it never flickers away. */
function withOutboxApplied(cache: Record<string, DayOff>, local: Record<string, DayOff>): Record<string, DayOff> {
  const next = { ...cache }
  for (const [localDate, entry] of Object.entries(loadRecord<OutboxEntry>(OUTBOX_KEY))) {
    if (entry.op === 'clear') delete next[localDate]
    else if (local[localDate]) next[localDate] = local[localDate]
  }
  return next
}

export interface UseDayOffsResult {
  /** Every marked day this device knows about, keyed `YYYY-MM-DD`. */
  dayOffs: Readonly<Record<string, DayOff>>
  /** Marks `localDate` as a day off, or updates its reason. Local first (rule 6). */
  setDayOff: (localDate: string, reason: string | null) => Promise<void>
  /** Un-marks `localDate`. Local first; server-side it's a soft delete (rule 11). */
  clearDayOff: (localDate: string) => Promise<void>
  /** The day whose write is in flight — its controls disable until it resolves (rule 9). */
  pendingDate: string | null
  error: string | null
}

/**
 * Non-working days — local-first (rule 6) with a background sync to
 * `public.day_offs`, the same shape `useDailyValue`/`useNoteEntries` follow.
 * `month` is the month the date picker shows; only that 6-week window is
 * fetched (rule 8), re-fetched whenever it changes.
 */
export function useDayOffs(month: Date): UseDayOffsResult {
  const [dayOffs, setDayOffs] = useState<Record<string, DayOff>>(loadCache)
  const [pendingDate, setPendingDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { from, to } = dayOffWindowForMonth(month)

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    void flushOutbox()
      .then(() => apiListDayOffs(from, to))
      .then((fresh) => {
        if (cancelled || fresh === null) return
        setDayOffs((prev) => {
          const next = withOutboxApplied(mergeDayOffWindow(prev, { from, to }, fresh), prev)
          writeStoredJSON(STORAGE_KEY, next)
          return next
        })
      })
    return () => {
      cancelled = true
    }
  }, [from, to])

  const commit = useCallback((update: (prev: Record<string, DayOff>) => Record<string, DayOff>) => {
    setDayOffs((prev) => {
      const next = update(prev)
      writeStoredJSON(STORAGE_KEY, next)
      return next
    })
  }, [])

  const setDayOff = useCallback(
    async (localDate: string, reason: string | null) => {
      const local: DayOff = {
        localDate,
        timeZone: deviceTimezone(),
        reason: normalizeDayOffReason(reason),
        updatedAt: new Date().toISOString(),
      }
      setError(null)
      setPendingDate(localDate)
      commit((prev) => ({ ...prev, [localDate]: local }))
      if (supabaseConfigured) {
        setOutbox(localDate, {
          op: 'set',
          timeZone: local.timeZone,
          reason: local.reason,
        })
        const server = await apiSetDayOff(local.localDate, local.timeZone, local.reason)
        if (server) {
          setOutbox(localDate, null)
          commit((prev) => ({ ...prev, [localDate]: server }))
        } else setError('Saved on this device — will sync once you’re back online.')
      }
      setPendingDate(null)
    },
    [commit],
  )

  const clearDayOff = useCallback(
    async (localDate: string) => {
      setError(null)
      setPendingDate(localDate)
      commit((prev) => {
        const next = { ...prev }
        delete next[localDate]
        return next
      })
      if (supabaseConfigured) {
        setOutbox(localDate, { op: 'clear' })
        if (await apiClearDayOff(localDate)) setOutbox(localDate, null)
        else setError('Removed on this device — will sync once you’re back online.')
      }
      setPendingDate(null)
    },
    [commit],
  )

  return { dayOffs, setDayOff, clearDayOff, pendingDate, error }
}
