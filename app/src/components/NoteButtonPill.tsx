import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CalendarClock, ChevronDown, Loader2, X } from 'lucide-react'
import { Chip, chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import {
  canSubmitNote,
  formatNoteTimestamp,
  noteButtonTypes,
  partitionNoteEntriesByToday,
  toggleEntryType,
  type NoteButtonKey,
  type NoteEntry,
} from '@/domain/notes'
import { NoteEntryRow } from '@/components/NoteEntryRow'
import { useNoteEntries } from '@/state/useNoteEntries'
import { useNoteWhen } from '@/state/useNoteWhen'
import { HeaderPopup } from '@/components/ui/HeaderPopup'
import { cn } from '@/lib/utils'
import { DictationField } from '@/components/ui/DictationButton'

const fieldClass =
  'w-full rounded-md border border-line bg-surface px-md py-sm text-body font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-dim hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * One header pill's whole note-entry surface: the trigger button, a Store
 * form (textarea, plus a multi-select type chip group for the buttons that
 * define one — see `NOTE_BUTTON_TYPES`: Extra Senses, Learnings — at least one
 * type required),
 * and the full history of previously stored notes for this one button.
 *
 * Deliberately follows `HeaderBar`'s OWN existing popover pattern
 * (`DatePill`/`AccountMenu`'s `open` state + outside-click/Escape-to-close +
 * focus-return) rather than the `LogActivityModal`'s Radix `Dialog` — that
 * modal is a full-screen sheet for a materially bigger editing task; this is
 * a small, anchored popover exactly like the two that already live in this
 * header, so it reuses their interaction pattern rather than inventing a
 * third one (CLAUDE.md's Component Rule).
 */
export function NoteButtonPill({ buttonKey, label }: { buttonKey: NoteButtonKey; label: string }) {
  const [open, setOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [entryTypes, setEntryTypes] = useState<string[]>([])
  const [justSaved, setJustSaved] = useState<{ at: Date | null } | null>(null)
  const when = useNoteWhen()
  // History is collapsed by default (SCRUM-13 follow-up) — the popover opens
  // straight to the Store form; the log of past notes is a click away
  // rather than always taking up space underneath it.
  const [historyOpen, setHistoryOpen] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const savedFlashTimeoutRef = useRef<number | undefined>(undefined)

  const textareaId = useId()
  const recentHeadingId = useId()
  const historyHeadingId = useId()
  const historyListId = useId()
  const whenId = useId()

  const { entries, status, error, submitting, addNote, pendingEntryId, updateNote, deleteNote } = useNoteEntries(
    buttonKey,
    open,
  )
  const types = noteButtonTypes(buttonKey)
  const canSubmit = canSubmitNote(buttonKey, noteText, entryTypes) && !when.error
  // "Today" here is the real device-current calendar day — notes aren't
  // day-scoped like a `ScheduledActivity` (no `viewedDate` concept exists in
  // this component at all), so this is deliberately NOT the header's viewed
  // date. Recomputed every render; cheap, and this popover isn't open long
  // enough for a stale local midnight to matter.
  const { recent: recentEntries, earlier: earlierEntries } = partitionNoteEntriesByToday(entries, new Date())

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Opening the popover puts focus straight into the note field — this is a
  // form the user opened specifically to write in, not a menu to browse.
  useEffect(() => {
    if (open) textareaRef.current?.focus()
    else {
      setHistoryOpen(false) // Collapsed again next time this popover opens.
      when.reset() // Each opening starts on "now" again.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    return () => window.clearTimeout(savedFlashTimeoutRef.current)
  }, [])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function toggle() {
    setOpen((wasOpen) => !wasOpen)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !canSubmit) return // Rule 9's double-submit guard, applied to Store.

    const chosen = when.when
    const ok = await addNote(noteText, entryTypes, chosen)
    if (!ok) return

    setNoteText('')
    setEntryTypes([])
    when.reset()
    setJustSaved({ at: chosen ?? null })
    window.clearTimeout(savedFlashTimeoutRef.current)
    savedFlashTimeoutRef.current = window.setTimeout(() => setJustSaved(null), 2500)
  }

  function renderEntryRow(entry: NoteEntry) {
    return (
      <NoteEntryRow
        key={entry.id}
        entry={entry}
        label={label}
        types={types}
        pendingEntryId={pendingEntryId}
        onUpdate={updateNote}
        onDelete={deleteNote}
      />
    )
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} notes`}
        onClick={toggle}
        className={cn(
          chipVariants({ tone: 'surface', size: 'sm', interactive: true }),
          'whitespace-nowrap font-semibold',
        )}
      >
        {label}
      </button>

      {open && (
        <HeaderPopup aria-label={`${label} notes`} onClose={close}>
          <div className="mb-md flex items-center justify-between">
            <h2 className="text-body font-semibold text-ink">{label}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="flex size-stepper items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
            >
              <X aria-hidden="true" className="size-[16px]" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
            {types && (
              <fieldset className="flex flex-col gap-sm">
                <legend className="text-caption font-semibold text-ink-dim">
                  Type <span className="font-normal">· choose one or more</span>
                </legend>
                <div role="group" aria-label="Type" className="flex flex-wrap gap-sm">
                  {types.map((type) => {
                    const isSelected = entryTypes.includes(type)
                    return (
                      <Chip
                        key={type}
                        as="button"
                        size="xs"
                        tone={isSelected ? 'active' : 'surface'}
                        interactive
                        aria-pressed={isSelected}
                        onClick={() => setEntryTypes((selected) => toggleEntryType(selected, type))}
                      >
                        {type}
                      </Chip>
                    )
                  })}
                </div>
              </fieldset>
            )}

            <div>
              <label htmlFor={textareaId} className="sr-only">
                Note
              </label>
              <DictationField disabled={submitting}>
                <textarea
                  ref={textareaRef}
                  id={textareaId}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  rows={3}
                  placeholder="Write a note…"
                  disabled={submitting}
                  className={cn('pr-5xl', fieldClass, 'resize-none disabled:opacity-60')}
                />
              </DictationField>
            </div>

            {when.custom ? (
              <div className="flex flex-col gap-xs">
                <label htmlFor={whenId} className="text-caption font-semibold text-ink-dim">
                  When
                </label>
                <div className="flex items-center gap-sm">
                  <input
                    id={whenId}
                    type="datetime-local"
                    aria-invalid={when.error !== null}
                    value={when.inputValue}
                    max={when.max}
                    disabled={submitting}
                    onChange={(event) => when.setInputValue(event.target.value)}
                    className={cn(fieldClass, 'min-w-0 flex-1 tabular-nums disabled:opacity-60')}
                  />
                  <Button type="button" variant="ghost" size="control" onClick={when.reset} disabled={submitting}>
                    Use now
                  </Button>
                </div>
                {when.error && (
                  <p role="alert" className="text-caption font-semibold text-ink-dim">
                    {when.error}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={when.start}
                disabled={submitting}
                className="flex items-center justify-between gap-sm rounded-md py-xs text-caption text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
              >
                <span className="flex items-center gap-xs">
                  <CalendarClock aria-hidden="true" className="size-[14px]" />
                  Now · {formatNoteTimestamp(new Date())}
                </span>
                <span className="font-semibold text-ink">Change</span>
              </button>
            )}

            {error && (
              <p role="alert" className="text-caption font-semibold text-ink-dim">
                {error}
              </p>
            )}

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
              {justSaved && (
                <span role="status" className="text-caption font-semibold text-ink-dim">
                  {justSaved.at ? `Saved for ${formatNoteTimestamp(justSaved.at)}.` : 'Saved.'}
                </span>
              )}
            </div>
          </form>

          <div className="mt-lg border-t border-line pt-md">
            {/* Recent — always visible, no toggle/collapse; today's notes only. */}
            <div>
              <h3 id={recentHeadingId} className="text-nano font-semibold uppercase tracking-tag text-ink-dim">
                Recent
              </h3>
              <div aria-labelledby={recentHeadingId} className="mt-sm">
                {status === 'loading' && entries.length === 0 && (
                  <p className="flex items-center gap-sm text-caption text-ink-dim">
                    <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
                    Loading…
                  </p>
                )}

                {status !== 'loading' && recentEntries.length === 0 && (
                  <p className="text-caption text-ink-dim">No notes yet today.</p>
                )}

                {recentEntries.length > 0 && (
                  <ul className="flex max-h-[320px] flex-col gap-sm overflow-y-auto">
                    {recentEntries.map((entry) => renderEntryRow(entry))}
                  </ul>
                )}
              </div>
            </div>

            {/* History — collapsed by default, ALWAYS rendered even when
                empty; scoped to everything other than today (no duplication
                with Recent above). */}
            <div className="mt-md">
              <button
                type="button"
                id={historyHeadingId}
                aria-expanded={historyOpen}
                aria-controls={historyListId}
                onClick={() => setHistoryOpen((value) => !value)}
                className="flex w-full items-center justify-between text-nano font-semibold uppercase tracking-tag text-ink-dim transition-colors hover:text-ink"
              >
                History
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-[14px] transition-transform', historyOpen && 'rotate-180')}
                />
              </button>

              {historyOpen && (
                <div id={historyListId} role="region" aria-labelledby={historyHeadingId} className="mt-sm">
                  {status === 'loading' && entries.length === 0 && (
                    <p className="flex items-center gap-sm text-caption text-ink-dim">
                      <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
                      Loading…
                    </p>
                  )}

                  {status !== 'loading' && earlierEntries.length === 0 && (
                    <p className="text-caption text-ink-dim">No earlier notes yet.</p>
                  )}

                  {earlierEntries.length > 0 && (
                    <ul className="flex max-h-[320px] flex-col gap-sm overflow-y-auto">
                      {earlierEntries.map((entry) => renderEntryRow(entry))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </HeaderPopup>
      )}
    </div>
  )
}
