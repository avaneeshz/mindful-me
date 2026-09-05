import { useCallback, useEffect, useRef, useState } from 'react'
import { apiCreateNoteEntry, apiListNoteEntries } from '@/api/notes'
import { generateId } from '@/domain/scheduling'
import type { GiftType, NoteButtonKey, NoteEntry } from '@/domain/notes'
import { loadLocalNoteEntries, saveLocalNoteEntries } from '@/lib/noteEntriesLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type NoteHistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseNoteEntriesResult {
  entries: NoteEntry[]
  /** History-fetch state — distinct from `submitting`, which only covers Store. */
  status: NoteHistoryStatus
  /** Set when the background server fetch or the background sync-on-Store failed; the local-first list above is still correct and shown regardless. */
  error: string | null
  /** True from the moment Store is pressed until the write settles — the Add-button double-submit guard (rule 9's spirit, applied to Store). */
  submitting: boolean
  addNote: (note: string, giftType: GiftType | null) => Promise<boolean>
}

/**
 * One button's note log: local-first (rule 6) list + background sync,
 * mirroring the shape `BoardContext` already established for scheduled
 * activities (local storage is the instant, always-correct source; a
 * configured Supabase project is a background mirror the UI never blocks
 * on) — generalized to a note-entries table instead of the board.
 *
 * `active` gates the network fetch so a popover that has never been opened
 * never issues a request — each `NoteButtonPill` passes its own `open`
 * state through.
 */
export function useNoteEntries(buttonKey: NoteButtonKey, active: boolean): UseNoteEntriesResult {
  const [entries, setEntries] = useState<NoteEntry[]>(() => loadLocalNoteEntries(buttonKey) ?? [])
  const [status, setStatus] = useState<NoteHistoryStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!active || hasFetchedRef.current) return
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    hasFetchedRef.current = true
    let cancelled = false
    setStatus('loading')
    apiListNoteEntries(buttonKey).then((server) => {
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load your saved notes — showing what’s saved on this device.')
        return
      }
      setEntries(server)
      saveLocalNoteEntries(buttonKey, server)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, buttonKey])

  const addNote = useCallback(
    async (note: string, giftType: GiftType | null): Promise<boolean> => {
      const trimmed = note.trim()
      if (trimmed === '') return false

      setSubmitting(true)
      setError(null)

      // Local-first (rule 6): the new entry is visible and durable on this
      // device before any network round-trip even starts.
      const local: NoteEntry = {
        id: generateId(),
        buttonKey,
        note: trimmed,
        giftType,
        createdAt: new Date().toISOString(),
      }
      const withLocal = [local, ...entries]
      setEntries(withLocal)
      saveLocalNoteEntries(buttonKey, withLocal)

      if (supabaseConfigured) {
        const server = await apiCreateNoteEntry(buttonKey, trimmed, giftType)
        if (server === null) {
          setError('Saved on this device — will sync once you’re back online.')
        } else {
          // Reconcile the locally-minted id/timestamp with the server's
          // authoritative row (same "server wins once it answers" shape
          // `BoardContext`'s hydrate reconciliation already follows).
          const reconciled = [server, ...entries]
          setEntries(reconciled)
          saveLocalNoteEntries(buttonKey, reconciled)
        }
      }

      setSubmitting(false)
      return true
    },
    [buttonKey, entries],
  )

  return { entries, status, error, submitting, addNote }
}
