import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { cardNoteWasEdited, MAX_CARD_NOTE_LENGTH, validateCardNote } from '@/domain/reflectionCardNotes'
import { formatNoteTimestamp } from '@/domain/notes'
import { useReflectionCardNotes } from '@/state/useReflectionCardNotes'
import { cn } from '@/lib/utils'

/**
 * What opens when a State Tile is tapped: a box to write a note, and below it
 * every note written on this tile before, newest first, each with the date
 * and time it was written. Any earlier note can be edited in place. Notes
 * belong to the tile and the account — they are not tied to an activity.
 */
export function CardNotesPanel({ card, title, open }: { card: number; title: string; open: boolean }) {
  const { notes, status, saving, addNote, updateNote } = useReflectionCardNotes(card, open)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const result = await addNote(draft)
    if (result.ok) {
      setDraft('')
      setDraftError(null)
    } else setDraftError(result.message)
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (saving || editingId === null) return
    const result = await updateNote(editingId, editText)
    if (result.ok) {
      setEditingId(null)
      setEditError(null)
    } else setEditError(result.message)
  }

  const draftBlocked = validateCardNote(draft) !== null

  return (
    <div className="flex flex-col gap-md">
      <form onSubmit={onAdd} className="flex flex-col gap-sm">
        <label htmlFor={`card-note-${card}`} className="text-caption font-semibold text-ink">
          {title}
        </label>
        <textarea
          id={`card-note-${card}`}
          rows={4}
          value={draft}
          maxLength={MAX_CARD_NOTE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note…"
          className={cn(fieldClass, 'resize-y py-sm')}
        />
        {draftError && (
          <p role="alert" className="text-caption text-ink">
            {draftError}
          </p>
        )}
        <div>
          <Button type="submit" disabled={saving || draftBlocked}>
            {saving && editingId === null ? <Loader2 aria-hidden="true" className="size-[14px] animate-spin" /> : null}
            Save note
          </Button>
        </div>
      </form>

      <section aria-label="Earlier notes" className="flex flex-col gap-sm border-t border-line pt-md">
        <h3 className="text-nano font-semibold uppercase tracking-tag text-ink-dim">History</h3>
        {status === 'loading' && notes.length === 0 && (
          <p className="flex items-center gap-sm text-caption text-ink-dim">
            <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
            Loading your notes…
          </p>
        )}
        {status === 'error' && (
          <p role="alert" className="text-caption text-ink-dim">
            Couldn’t load your latest notes. Showing what’s saved on this device.
          </p>
        )}
        {status !== 'loading' && notes.length === 0 && (
          <p className="text-caption text-ink-dim">No notes yet. What you write here will be kept with its date and time.</p>
        )}
        <ul className="flex max-h-[260px] flex-col gap-sm overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-line bg-surface-2 p-sm">
              {editingId === n.id ? (
                <form onSubmit={onSaveEdit} className="flex flex-col gap-sm">
                  <textarea
                    aria-label="Edit note"
                    autoFocus
                    rows={4}
                    value={editText}
                    maxLength={MAX_CARD_NOTE_LENGTH}
                    onChange={(e) => setEditText(e.target.value)}
                    className={cn(fieldClass, 'resize-y py-sm')}
                  />
                  {editError && (
                    <p role="alert" className="text-caption text-ink">
                      {editError}
                    </p>
                  )}
                  <div className="flex items-center gap-sm">
                    <Button type="submit" disabled={saving || validateCardNote(editText) !== null}>
                      {saving ? <Loader2 aria-hidden="true" className="size-[14px] animate-spin" /> : null}
                      Save
                    </Button>
                    <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="whitespace-pre-wrap break-words text-body text-ink">{n.note}</p>
                  <div className="mt-xs flex items-center justify-between gap-sm">
                    <p className="text-caption text-ink-dim">
                      {formatNoteTimestamp(new Date(n.createdAt))}
                      {cardNoteWasEdited(n) && ` · edited ${formatNoteTimestamp(new Date(n.updatedAt))}`}
                    </p>
                    <button
                      type="button"
                      aria-label={`Edit note from ${formatNoteTimestamp(new Date(n.createdAt))}`}
                      onClick={() => {
                        setEditingId(n.id)
                        setEditText(n.note)
                        setEditError(null)
                      }}
                      className="shrink-0 text-caption font-medium text-ink-dim underline-offset-2 hover:text-ink hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
