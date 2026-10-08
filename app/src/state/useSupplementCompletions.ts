import { useCallback, useEffect, useRef, useState } from 'react'
import { apiListSupplementCompletions } from '@/api/supplements'
import { reconcileList } from '@/domain/reconcileList'
import { fullDayChecklist, type SupplementCompletion, type SupplementItemConfig, type SupplementItemKey } from '@/domain/supplements'
import { loadLocalSupplementCompletions, saveLocalSupplementCompletions } from '@/lib/supplementsLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { getPendingIds, writeThrough } from './pendingWrites'

export type SupplementsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseSupplementCompletionsResult {
  /** The full checklist for `localDate`, in this button's own configured item order — untouched items render unchecked. */
  checklist: SupplementCompletion[]
  status: SupplementsStatus
  error: string | null
  setCompletion: (itemKey: SupplementItemKey, done: boolean, note: string) => Promise<void>
}

/**
 * One calendar day's checklist for ONE checklist-category header button:
 * local-first (rule 6) + a background sync, mirroring
 * `state/useNoteEntries.ts` exactly, generalized from "one button's whole
 * history" to "one day's checklist" — the genuinely new interaction shape
 * this control needs (see `domain/supplements.ts`'s own doc comment).
 * Generalized further, this round, from "the one Supplements button" to
 * "any checklist-category button" — `headerButtonId`/`items` come from that
 * button's own `HeaderButtonConfig`.
 *
 * `active` gates the network fetch so a popover that has never been opened
 * never issues a request — `ChecklistButton` passes its own `open` state
 * through, same as `NoteButtonPill`.
 */
export function useSupplementCompletions(
  headerButtonId: string,
  items: readonly SupplementItemConfig[],
  localDate: string,
  active: boolean,
): UseSupplementCompletionsResult {
  const [entries, setEntries] = useState<SupplementCompletion[]>(
    () => loadLocalSupplementCompletions(headerButtonId, localDate) ?? [],
  )
  const [status, setStatus] = useState<SupplementsStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef<string | null>(null)

  // The local-cache read is per (button, day) — re-read whenever the header date or button changes.
  useEffect(() => {
    setEntries(loadLocalSupplementCompletions(headerButtonId, localDate) ?? [])
  }, [headerButtonId, localDate])

  useEffect(() => {
    const fetchKey = `${headerButtonId}:${localDate}`
    if (!active || hasFetchedRef.current === fetchKey) return
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    hasFetchedRef.current = fetchKey
    let cancelled = false
    setStatus('loading')
    apiListSupplementCompletions(headerButtonId, localDate).then((server) => {
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load today’s checklist — showing what’s saved on this device.')
        return
      }
      // The server answers for everything it has confirmed — but a tick the user
      // made that the server hasn't confirmed yet is never erased by it.
      const pending = getPendingIds('supplement')
      const keyOf = (entry: SupplementCompletion) => `${headerButtonId}:${localDate}:${entry.itemKey}`
      const merged = reconcileList(
        loadLocalSupplementCompletions(headerButtonId, localDate) ?? [],
        server,
        pending.save,
        pending.delete,
        keyOf,
      )
      setEntries(merged)
      saveLocalSupplementCompletions(headerButtonId, localDate, merged)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, headerButtonId, localDate])

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
      saveLocalSupplementCompletions(headerButtonId, localDate, next)

      if (supabaseConfigured) {
        const out = await writeThrough<SupplementCompletion>({
          action: 'supplement.set',
          entity: 'supplement',
          recordId: `${headerButtonId}:${localDate}:${itemKey}`,
          op: 'save',
          args: [headerButtonId, itemKey, localDate, done, note],
          label: `${done ? 'Tick' : 'Untick'} checklist item “${itemKey}” for ${localDate}${note ? ` — ${note}` : ''}`,
          coalesce: true,
        })
        if (out.status !== 'ok' || !out.result) {
          setError('Saved on this device — will sync once you’re back online.')
        } else {
          const reconciled = [...withoutItem, out.result]
          setEntries(reconciled)
          saveLocalSupplementCompletions(headerButtonId, localDate, reconciled)
        }
      }
    },
    [entries, headerButtonId, localDate],
  )

  return { checklist: fullDayChecklist(items, localDate, entries), status, error, setCompletion }
}
