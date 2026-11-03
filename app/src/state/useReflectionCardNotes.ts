import { useCallback, useEffect, useState } from 'react'
import { apiCreateReflectionCardNote, apiListReflectionCardNotes, apiUpdateReflectionCardNote } from '@/api/reflectionCardNotes'
import { sortNotesNewestFirst, validateCardNote, type ReflectionCardNote } from '@/domain/reflectionCardNotes'
import { generateId } from '@/domain/scheduling'
import { loadCardNotes, saveCardNotes } from '@/lib/reflectionCardNotesStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { useAccountOwner } from '@/state/useAccountOwner'

export type CardNotesStatus = 'idle' | 'loading' | 'ready' | 'error'
export type CardNoteSaveResult = { ok: true } | { ok: false; message: string }

const SAVE_FAILED = 'Couldn’t save right now. Your text is still here — check your connection and try again.'

/**
 * One State Tile's notes for the signed-in account: the history, plus adding
 * a note and editing an earlier one. The device copy paints first; with a
 * backend the server's list replaces it once it answers. Saves wait for the
 * server so a note is never shown as saved when it isn't — a failure leaves
 * the user's text where it is and says so.
 *
 * `active` gates the fetch so a tile that was never opened costs no request.
 */
export function useReflectionCardNotes(card: number, active: boolean) {
  const owner = useAccountOwner()
  const [notes, setNotes] = useState<ReflectionCardNote[]>([])
  const [status, setStatus] = useState<CardNotesStatus>('idle')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!active || !owner) return
    setNotes(loadCardNotes(owner, card))
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    let cancelled = false
    setStatus('loading')
    void apiListReflectionCardNotes(card).then((server) => {
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        return
      }
      setNotes(server)
      saveCardNotes(owner, card, server)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [active, owner, card])

  const commit = useCallback(
    (next: ReflectionCardNote[]) => {
      const sorted = sortNotesNewestFirst(next)
      setNotes(sorted)
      if (owner) saveCardNotes(owner, card, sorted)
    },
    [owner, card],
  )

  const addNote = useCallback(
    async (text: string): Promise<CardNoteSaveResult> => {
      const problem = validateCardNote(text)
      if (problem) return { ok: false, message: problem }
      setSaving(true)
      const id = generateId()
      let saved: ReflectionCardNote
      if (supabaseConfigured) {
        const result = await apiCreateReflectionCardNote(id, card, text.trim())
        if (!result.ok) {
          setSaving(false)
          return { ok: false, message: result.reason === 'invalid' ? 'That note can’t be saved.' : SAVE_FAILED }
        }
        saved = result.note
      } else {
        const now = new Date().toISOString()
        saved = { id, card, note: text.trim(), createdAt: now, updatedAt: now }
      }
      commit([saved, ...notes])
      setSaving(false)
      return { ok: true }
    },
    [card, notes, commit],
  )

  const updateNote = useCallback(
    async (id: string, text: string): Promise<CardNoteSaveResult> => {
      const problem = validateCardNote(text)
      if (problem) return { ok: false, message: problem }
      setSaving(true)
      let saved: ReflectionCardNote | undefined
      if (supabaseConfigured) {
        const result = await apiUpdateReflectionCardNote(id, text.trim())
        if (!result.ok) {
          setSaving(false)
          return { ok: false, message: result.reason === 'invalid' ? 'That note can’t be saved.' : SAVE_FAILED }
        }
        saved = result.note
      } else {
        const existing = notes.find((n) => n.id === id)
        if (existing) saved = { ...existing, note: text.trim(), updatedAt: new Date().toISOString() }
      }
      if (saved) {
        const updated = saved
        commit(notes.map((n) => (n.id === id ? updated : n)))
      }
      setSaving(false)
      return { ok: true }
    },
    [notes, commit],
  )

  return { notes, status, saving, addNote, updateNote }
}
