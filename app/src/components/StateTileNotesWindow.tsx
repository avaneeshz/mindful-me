import { useId, useRef, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { NoteEntryRow } from '@/components/NoteEntryRow'
import { canSubmitNote, partitionNoteEntriesByToday, stateTileNoteKey } from '@/domain/notes'
import { useNoteEntries } from '@/state/useNoteEntries'
import { cn } from '@/lib/utils'

/**
 * The full-screen window a State Tile opens: an "Add content" button that
 * reveals a free-form note field, and every note written on the tile below,
 * newest first (today, then earlier). It is the header free-form note
 * button's surface on a bigger canvas — the same `useNoteEntries` hook,
 * `note_entries` storage (key `state_tile_<card>`), timestamps, edit and
 * remove — so a header note button's notes can later be moved onto a tile
 * without any conversion.
 *
 * Deliberately no `Dialog.Portal`, same reason as `LogActivityModal`: this
 * app's tests are server-rendered strings and portalled content never
 * appears in them.
 */
export function StateTileNotesWindow({
  card,
  title,
  open,
  onOpenChange,
}: {
  card: number
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const buttonKey = stateTileNoteKey(card)
  const { entries, status, error, submitting, addNote, pendingEntryId, updateNote, deleteNote } = useNoteEntries(
    buttonKey,
    open,
  )
  const [composing, setComposing] = useState(false)
  const [noteText, setNoteText] = useState('')
  const textareaId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSubmit = canSubmitNote(buttonKey, noteText, [])
  const { recent, earlier } = partitionNoteEntriesByToday(entries, new Date())

  function handleOpenChange(next: boolean) {
    if (!next) {
      setComposing(false)
      setNoteText('')
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !canSubmit) return // Rule 9: double-submit guard.
    if (await addNote(noteText, [])) {
      setNoteText('')
      setComposing(false)
    }
  }

  function renderSection(heading: string, list: typeof entries, emptyText: string | null) {
    if (list.length === 0 && emptyText === null) return null
    return (
      <section aria-label={heading} className="flex flex-col gap-sm">
        <h3 className="text-nano font-semibold uppercase tracking-tag text-ink-dim">{heading}</h3>
        {list.length === 0 ? (
          <p className="text-caption text-ink-dim">{emptyText}</p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {list.map((entry) => (
              <NoteEntryRow
                key={entry.id}
                entry={entry}
                label={title}
                types={null}
                pendingEntryId={pendingEntryId}
                onUpdate={updateNote}
                onDelete={deleteNote}
              />
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-bg focus:outline-none',
          '[padding-top:env(safe-area-inset-top)] [padding-bottom:env(safe-area-inset-bottom)]',
        )}
        onOpenAutoFocus={(event) => {
          // Land on the page, not on Close; the note field takes focus once "Add content" opens it.
          event.preventDefault()
        }}
      >
        <header className="flex items-center justify-between gap-md border-b border-line bg-surface px-xl py-md mobile:px-lg">
          <Dialog.Title className="min-w-0 truncate font-display text-h1-sm font-semibold text-ink">{title}</Dialog.Title>
          <div className="flex shrink-0 items-center gap-sm">
            {!composing && (
              <Button
                type="button"
                size="control"
                onClick={() => {
                  setComposing(true)
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
              >
                <Plus aria-hidden="true" className="size-[14px]" />
                Add content
              </Button>
            )}
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={`Close ${title}`}
                className="flex size-stepper items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <X aria-hidden="true" className="size-[18px]" />
              </button>
            </Dialog.Close>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-xl px-xl py-xl mobile:px-lg mobile:py-lg">
            {composing && (
              <form onSubmit={handleSubmit} className="flex flex-col gap-sm rounded-md border border-line bg-surface p-md shadow-elevation-1">
                <label htmlFor={textareaId} className="sr-only">
                  Note
                </label>
                <textarea
                  ref={textareaRef}
                  id={textareaId}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  rows={6}
                  placeholder="Write here…"
                  disabled={submitting}
                  className={cn(fieldClass, 'resize-y font-semibold disabled:opacity-60')}
                />
                <div className="flex items-center gap-sm">
                  <Button type="submit" size="control" disabled={submitting || !canSubmit}>
                    {submitting ? (
                      <>
                        <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
                        Saving…
                      </>
                    ) : (
                      'Store'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="control"
                    disabled={submitting}
                    onClick={() => {
                      setComposing(false)
                      setNoteText('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {error && (
              <p role="alert" className="text-caption font-semibold text-ink-dim">
                {error}
              </p>
            )}

            {status === 'loading' && entries.length === 0 && (
              <p className="flex items-center gap-sm text-caption text-ink-dim">
                <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
                Loading…
              </p>
            )}

            {status !== 'loading' && entries.length === 0 && !composing && (
              <div className="flex flex-col items-start gap-sm rounded-md border border-dashed border-line p-xl">
                <p className="text-body font-semibold text-ink">Nothing here yet</p>
                <p className="text-caption text-ink-dim">Use Add content to write your first note. It is saved with its date and time.</p>
              </div>
            )}

            {renderSection('Today', recent, null)}
            {renderSection('Earlier', earlier, null)}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
