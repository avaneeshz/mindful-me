import { useCallback, useEffect, useRef, useState } from 'react'
import { apiListNoteEntries } from '@/api/notes'
import { reconcileList } from '@/domain/reconcileList'
import { generateId } from '@/domain/scheduling'
import { noteButtonLabel, type NoteButtonKey, type NoteEntry } from '@/domain/notes'
import { loadLocalNoteEntries, saveLocalNoteEntries } from '@/lib/noteEntriesLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { amendPendingWrite, cancelPendingWrite, getPendingIds, writeThrough } from './pendingWrites'

export type NoteHistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseNoteEntriesResult {
  entries: NoteEntry[]
  /** History-fetch state — distinct from `submitting`, which only covers Store. */
  status: NoteHistoryStatus
  /** Set when the background server fetch or the background sync-on-Store failed; the local-first list above is still correct and shown regardless. */
  error: string | null
  /** True from the moment Store is pressed until the write settles — the Add-button double-submit guard (rule 9's spirit, applied to Store). */
  submitting: boolean
  addNote: (note: string, entryTypes: readonly string[]) => Promise<boolean>
  /** The id of the entry currently being saved (edit) or removed, if any — the same double-submit guard as `submitting`, scoped per-row since a history list has many independent rows. */
  pendingEntryId: string | null
  updateNote: (id: string, note: string, entryTypes: readonly string[]) => Promise<boolean>
  deleteNote: (id: string) => Promise<boolean>
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
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null)
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
      // The server answers for everything it has confirmed — but a note the
      // user wrote and the server hasn't confirmed yet (a failed or slow save)
      // is never erased by it. The device's own copy is the "local" side.
      const pending = getPendingIds('note')
      const merged = reconcileList(loadLocalNoteEntries(buttonKey) ?? [], server, pending.save, pending.delete, (e) => e.id)
      setEntries(merged)
      saveLocalNoteEntries(buttonKey, merged)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, buttonKey])

  const addNote = useCallback(
    async (note: string, entryTypes: readonly string[]): Promise<boolean> => {
      const trimmed = note.trim()
      if (trimmed === '') return false

      setSubmitting(true)
      setError(null)

      // Local-first (rule 6): the new entry is visible and durable on this
      // device before any network round-trip even starts.
      const now = new Date().toISOString()
      const local: NoteEntry = {
        id: generateId(),
        buttonKey,
        note: trimmed,
        entryTypes,
        createdAt: now,
        updatedAt: now,
      }
      const withLocal = [local, ...entries]
      setEntries(withLocal)
      saveLocalNoteEntries(buttonKey, withLocal)

      if (supabaseConfigured) {
        const out = await writeThrough<NoteEntry>({
          action: 'note.create',
          entity: 'note',
          recordId: local.id,
          op: 'save',
          args: [buttonKey, trimmed, [...entryTypes], local.id],
          label: `Add note on “${noteButtonLabel(buttonKey)}”${entryTypes.length ? ` · ${entryTypes.join(', ')}` : ''}`,
        })
        if (out.status !== 'ok' || !out.result) {
          setError('Saved on this device — will sync once you’re back online.')
        } else {
          // Reconcile the locally-minted id/timestamp with the server's
          // authoritative row ("server wins once it answers").
          const reconciled = [out.result, ...entries]
          setEntries(reconciled)
          saveLocalNoteEntries(buttonKey, reconciled)
        }
      }

      setSubmitting(false)
      return true
    },
    [buttonKey, entries],
  )

  const updateNote = useCallback(
    async (id: string, note: string, entryTypes: readonly string[]): Promise<boolean> => {
      const trimmed = note.trim()
      if (trimmed === '') return false
      if (pendingEntryId !== null) return false // Rule 9's guard, per-row.

      setPendingEntryId(id)
      setError(null)

      // Local-first (rule 6): the edit is visible and durable on this device
      // before any network round-trip even starts. `updatedAt` moves right
      // away too, so `noteEntryWasEdited` reads true immediately rather than
      // waiting on the server's own timestamp.
      const now = new Date().toISOString()
      const withLocal = entries.map((entry) =>
        entry.id === id ? { ...entry, note: trimmed, entryTypes, updatedAt: now } : entry,
      )
      setEntries(withLocal)
      saveLocalNoteEntries(buttonKey, withLocal)

      if (supabaseConfigured) {
        const label = `Edit note on “${noteButtonLabel(buttonKey)}”${entryTypes.length ? ` · ${entryTypes.join(', ')}` : ''}`
        // The note's first save never reached the server yet: just correct the
        // unsent save, rather than editing a note the server has no id for.
        if (amendPendingWrite('note', id, 'note.create', { args: [buttonKey, trimmed, [...entryTypes], id], label })) {
          setPendingEntryId(null)
          return true
        }
        const out = await writeThrough<NoteEntry>({
          action: 'note.update',
          entity: 'note',
          recordId: id,
          op: 'save',
          args: [id, trimmed, [...entryTypes]],
          label,
        })
        if (out.status !== 'ok' || !out.result) {
          setError('Saved on this device — will sync once you’re back online.')
        } else {
          const server = out.result
          const reconciled = withLocal.map((entry) => (entry.id === id ? server : entry))
          setEntries(reconciled)
          saveLocalNoteEntries(buttonKey, reconciled)
        }
      }

      setPendingEntryId(null)
      return true
    },
    [buttonKey, entries, pendingEntryId],
  )

  const deleteNote = useCallback(
    async (id: string): Promise<boolean> => {
      if (pendingEntryId !== null) return false // Rule 9's guard, per-row.

      setPendingEntryId(id)
      setError(null)

      // Rule 11 — immediate from the user's view. Local-first removal happens
      // before the network round-trip; the server side is a real soft
      // delete (recoverable for 30 days, then purged), not a hard delete.
      const removed = entries.find((entry) => entry.id === id)
      const withoutEntry = entries.filter((entry) => entry.id !== id)
      setEntries(withoutEntry)
      saveLocalNoteEntries(buttonKey, withoutEntry)

      if (supabaseConfigured) {
        const label = `Delete note on “${noteButtonLabel(buttonKey)}”${removed ? `: ${removed.note}` : ''}`
        // Edits still waiting to be sent are moot once the note is gone.
        while (cancelPendingWrite('note', id, 'note.update', 'Dropped an unsent edit of a deleted note')) {
          // each pass removes one
        }
        // A note whose first save never reached the server: nothing to delete there.
        if (cancelPendingWrite('note', id, 'note.create', label)) {
          setPendingEntryId(null)
          return true
        }
        const out = await writeThrough({ action: 'note.delete', entity: 'note', recordId: id, op: 'delete', args: [id], label })
        if (out.status !== 'ok') {
          setError('Removed on this device — will sync once you’re back online.')
        }
      }

      setPendingEntryId(null)
      return true
    },
    [buttonKey, entries, pendingEntryId],
  )

  return { entries, status, error, submitting, addNote, pendingEntryId, updateNote, deleteNote }
}
