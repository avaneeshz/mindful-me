import { useCallback, useEffect, useRef, useState } from 'react'
import { apiListSupplementCompletions, apiSetSupplementCompletion } from '@/api/supplements'
import { fullDayChecklist, type SupplementCompletion, type SupplementItemKey } from '@/domain/supplements'
import { loadLocalSupplementCompletions, saveLocalSupplementCompletions } from '@/lib/supplementsLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type SupplementsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseSupplementCompletionsResult {
  /** The full 7-item checklist for `localDate`, in `SUPPLEMENT_ITEMS`' own order — untouched items render unchecked. */
  checklist: SupplementCompletion[]
  status: SupplementsStatus
  error: string | null
  setCompletion: (itemKey: SupplementItemKey, done: boolean, note: string) => Promise<void>
}

/**
 * One calendar day's Supplements checklist: local-first (rule 6) + a
 * background sync, mirroring `state/useNoteEntries.ts` exactly, generalized
 * from "one button's whole history" to "one day's 7-item checklist" — the
 * genuinely new interaction shape this control needs (see
 * `domain/supplements.ts`'s own doc comment).
 *
 * `active` gates the network fetch so a popover that has never been opened
 * never issues a request — `SupplementsButton` passes its own `open` state
 * through, same as `NoteButtonPill`.
 */
export function useSupplementCompletions(localDate: string, active: boolean): UseSupplementCompletionsResult {
  const [entries, setEntries] = useState<SupplementCompletion[]>(
    () => loadLocalSupplementCompletions(localDate) ?? [],
  )
  const [status, setStatus] = useState<SupplementsStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef<string | null>(null)

  // The local-cache read is per DAY — re-read whenever the header date moves.
  useEffect(() => {
    setEntries(loadLocalSupplementCompletions(localDate) ?? [])
  }, [localDate])

  useEffect(() => {
    if (!active || hasFetchedRef.current === localDate) return
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    hasFetchedRef.current = localDate
    let cancelled = false
    setStatus('loading')
    apiListSupplementCompletions(localDate).then((server) => {
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load today’s checklist — showing what’s saved on this device.')
        return
      }
      setEntries(server)
      saveLocalSupplementCompletions(localDate, server)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, localDate])

  const setCompletion = useCallback(
    async (itemKey: SupplementItemKey, done: boolean, note: string): Promise<void> => {
      setError(null)

      // Local-first (rule 6): visible and durable on this device before any
      // network round-trip even starts.
      const optimistic: SupplementCompletion = {
        itemKey,
        localDate,
        done,
        note,
        completedAt: done ? new Date().toISOString() : null,
      }
      const withoutItem = entries.filter((entry) => entry.itemKey !== itemKey)
      const next = [...withoutItem, optimistic]
      setEntries(next)
      saveLocalSupplementCompletions(localDate, next)

      if (supabaseConfigured) {
        const server = await apiSetSupplementCompletion(itemKey, localDate, done, note)
        if (server === null) {
          setError('Saved on this device — will sync once you’re back online.')
        } else {
          const reconciled = [...withoutItem, server]
          setEntries(reconciled)
          saveLocalSupplementCompletions(localDate, reconciled)
        }
      }
    },
    [entries, localDate],
  )

  return { checklist: fullDayChecklist(localDate, entries), status, error, setCompletion }
}
