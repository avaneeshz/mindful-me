import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Loader2, Pencil, X } from 'lucide-react'
import { Chip, chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import {
  canSubmitNote,
  formatEntryTypes,
  formatNoteTimestamp,
  noteButtonTypes,
  noteEntryWasEdited,
  partitionNoteEntriesByToday,
  toggleEntryType,
  type NoteButtonKey,
  type NoteEntry,
} from '@/domain/notes'
import { useNoteEntries } from '@/state/useNoteEntries'
import { cn } from '@/lib/utils'

const fieldClass =
  'w-full rounded-md border border-line bg-surface px-md py-sm text-body font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-dim hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

const PANEL_WIDTH = 560
/** Minimum gap the panel keeps from either viewport edge. */
const VIEWPORT_GUTTER = 16

/**
 * Horizontal offset (px, relative to the trigger's left edge) that places a
 * `PANEL_WIDTH`-wide panel as close to left-aligned with its trigger as
 * possible while keeping it fully on screen. The panel itself shrinks to
 * `100vw − 2 × gutter` on a viewport narrower than `PANEL_WIDTH`, so the
 * same math covers phones.
 */
function panelOffset(triggerLeft: number, viewportWidth: number): number {
  const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_GUTTER * 2)
  const maxLeft = viewportWidth - VIEWPORT_GUTTER - width
  const left = Math.min(Math.max(triggerLeft, VIEWPORT_GUTTER), maxLeft)
  return left - triggerLeft
}

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
  // Horizontal shift (px from the trigger's left edge) that keeps the panel
  // inside the viewport — recomputed on open and on resize while open.
  const [offset, setOffset] = useState(0)
  const [noteText, setNoteText] = useState('')
  const [entryTypes, setEntryTypes] = useState<string[]>([])
  const [justSaved, setJustSaved] = useState(false)
  // History is collapsed by default (SCRUM-13 follow-up) — the popover opens
  // straight to the Store form; the log of past notes is a click away
  // rather than always taking up space underneath it.
  const [historyOpen, setHistoryOpen] = useState(false)
  // Which past entry (if any) the history list currently has open as an
  // inline edit form — mutually exclusive with the Store form above; only
  // ever one row at a time, same "one thing being edited" shape the
  // timeline's own `LogActivityModal` follows.
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [editEntryTypes, setEditEntryTypes] = useState<string[]>([])

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const savedFlashTimeoutRef = useRef<number | undefined>(undefined)

  const textareaId = useId()
  const recentHeadingId = useId()
  const historyHeadingId = useId()
  const historyListId = useId()
  const editTextareaId = useId()

  const { entries, status, error, submitting, addNote, pendingEntryId, updateNote, deleteNote } = useNoteEntries(
    buttonKey,
    open,
  )
  const types = noteButtonTypes(buttonKey)
  const canSubmit = canSubmitNote(buttonKey, noteText, entryTypes)
  const canSubmitEdit = canSubmitNote(buttonKey, editNoteText, editEntryTypes)
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

    function handleResize() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) setOffset(panelOffset(rect.left, window.innerWidth))
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [open])

  // Opening the popover puts focus straight into the note field — this is a
  // form the user opened specifically to write in, not a menu to browse.
  useEffect(() => {
    if (open) textareaRef.current?.focus()
    else {
      setHistoryOpen(false) // Collapsed again next time this popover opens.
      setEditingEntryId(null) // Same — a stale edit form never survives a close/reopen.
    }
  }, [open])

  useEffect(() => {
    return () => window.clearTimeout(savedFlashTimeoutRef.current)
  }, [])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        const rect = triggerRef.current?.getBoundingClientRect()
        if (rect) setOffset(panelOffset(rect.left, window.innerWidth))
      }
      return !wasOpen
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !canSubmit) return // Rule 9's double-submit guard, applied to Store.

    const ok = await addNote(noteText, entryTypes)
    if (!ok) return

    setNoteText('')
    setEntryTypes([])
    setJustSaved(true)
    window.clearTimeout(savedFlashTimeoutRef.current)
    savedFlashTimeoutRef.current = window.setTimeout(() => setJustSaved(false), 2500)
  }

  function startEdit(entry: NoteEntry) {
    setEditingEntryId(entry.id)
    setEditNoteText(entry.note)
    setEditEntryTypes([...entry.entryTypes])
  }

  function cancelEdit() {
    setEditingEntryId(null)
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (editingEntryId === null || pendingEntryId !== null || !canSubmitEdit) return
    const ok = await updateNote(editingEntryId, editNoteText, editEntryTypes)
    if (ok) setEditingEntryId(null)
  }

  /**
   * One entry's `<li>` — either its inline edit form or its view/edit/remove
   * row — shared by BOTH the "Recent" and "History" lists below so neither
   * duplicates this markup (CLAUDE.md's Component Rule).
   */
  function renderEntryRow(entry: NoteEntry) {
    if (editingEntryId === entry.id) {
      return (
        <li key={entry.id} className="rounded-sm bg-bg px-sm py-xs">
          <form onSubmit={saveEdit} className="flex flex-col gap-sm">
            {types && (
              <fieldset className="flex flex-col gap-sm">
                <legend className="sr-only">Type (choose one or more)</legend>
                <div role="group" aria-label="Type" className="flex flex-wrap gap-xs">
                  {types.map((type) => {
                    const isSelected = editEntryTypes.includes(type)
                    return (
                      <Chip
                        key={type}
                        as="button"
                        size="xs"
                        tone={isSelected ? 'active' : 'surface'}
                        interactive
                        aria-pressed={isSelected}
                        onClick={() => setEditEntryTypes((selected) => toggleEntryType(selected, type))}
                      >
                        {type}
                      </Chip>
                    )
                  })}
                </div>
              </fieldset>
            )}
            <label htmlFor={editTextareaId} className="sr-only">
              Edit note
            </label>
            <textarea
              id={editTextareaId}
              value={editNoteText}
              onChange={(event) => setEditNoteText(event.target.value)}
              rows={3}
              autoFocus
              disabled={pendingEntryId === entry.id}
              className={cn(fieldClass, 'resize-none text-caption disabled:opacity-60')}
            />
            <div className="flex items-center gap-md">
              <Button
                type="submit"
                variant="accent"
                size="inline"
                disabled={pendingEntryId === entry.id || !canSubmitEdit}
              >
                {pendingEntryId === entry.id ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-[13px] animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="inline"
                onClick={cancelEdit}
                disabled={pendingEntryId === entry.id}
              >
                Cancel
              </Button>
            </div>
          </form>
        </li>
      )
    }

    return (
      <li key={entry.id} className="rounded-sm bg-bg px-sm py-xs">
        <div className="flex items-center justify-between gap-sm">
          <time dateTime={entry.createdAt} className="text-nano font-semibold text-ink-dim">
            {formatNoteTimestamp(new Date(entry.createdAt))}
            {noteEntryWasEdited(entry) && ' · edited'}
          </time>
          {entry.entryTypes.length > 0 && (
            <span className="text-right text-nano font-semibold text-ink-dim">
              {formatEntryTypes(entry.entryTypes)}
            </span>
          )}
        </div>
        <p className="mt-xs whitespace-pre-wrap text-caption text-ink">{entry.note}</p>
        <div className="mt-xs flex items-center gap-lg">
          <Button
            variant="accent"
            size="inline"
            onClick={() => startEdit(entry)}
            disabled={pendingEntryId !== null}
            aria-label={`Edit this ${label} note`}
          >
            <Pencil aria-hidden="true" className="size-[12px]" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="inline"
            onClick={() => void deleteNote(entry.id)}
            disabled={pendingEntryId !== null}
            aria-label={`Remove this ${label} note`}
          >
            <X aria-hidden="true" className="size-[12px]" />
            {pendingEntryId === entry.id ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </li>
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
        <div
          role="dialog"
          aria-label={`${label} notes`}
          className={cn(
            'absolute left-0 top-[calc(100%+8px)] z-30 w-[min(560px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2',
          )}
          style={{ transform: `translateX(${offset}px)` }}
        >
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
              <textarea
                ref={textareaRef}
                id={textareaId}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                rows={3}
                placeholder="Write a note…"
                disabled={submitting}
                className={cn(fieldClass, 'resize-none disabled:opacity-60')}
              />
            </div>

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
                  Saved.
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
        </div>
      )}
    </div>
  )
}
