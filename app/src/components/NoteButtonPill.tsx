import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import {
  canSubmitNote,
  formatNoteTimestamp,
  GIFT_TYPES,
  requiresGiftType,
  type GiftType,
  type NoteButtonKey,
} from '@/domain/notes'
import { useNoteEntries } from '@/state/useNoteEntries'
import { cn } from '@/lib/utils'

const fieldClass =
  'w-full rounded-md border border-line bg-surface px-md py-sm text-body font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-dim hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * SCRUM-13 — one header pill's whole note-entry surface: the trigger button,
 * a Store form (textarea, plus a gift-type dropdown for Gifts only), and the
 * full history of previously stored notes for this one button.
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
  const [giftType, setGiftType] = useState<GiftType | ''>('')
  const [justSaved, setJustSaved] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const savedFlashTimeoutRef = useRef<number | undefined>(undefined)

  const textareaId = useId()
  const selectId = useId()
  const historyHeadingId = useId()

  const { entries, status, error, submitting, addNote } = useNoteEntries(buttonKey, open)
  const needsGiftType = requiresGiftType(buttonKey)
  const canSubmit = canSubmitNote(buttonKey, noteText, giftType === '' ? null : giftType)

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
  }, [open])

  useEffect(() => {
    return () => window.clearTimeout(savedFlashTimeoutRef.current)
  }, [])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !canSubmit) return // Rule 9's double-submit guard, applied to Store.

    const ok = await addNote(noteText, giftType === '' ? null : giftType)
    if (!ok) return

    setNoteText('')
    setGiftType('')
    setJustSaved(true)
    window.clearTimeout(savedFlashTimeoutRef.current)
    savedFlashTimeoutRef.current = window.setTimeout(() => setJustSaved(false), 2500)
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} notes`}
        onClick={() => setOpen((value) => !value)}
        className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
      >
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} notes`}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(340px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2 mobile:left-0 mobile:right-auto"
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
            {needsGiftType && (
              <div>
                <label htmlFor={selectId} className="mb-xs block text-caption font-semibold text-ink-dim">
                  Gift type
                </label>
                <select
                  id={selectId}
                  value={giftType}
                  onChange={(event) => setGiftType(event.target.value as GiftType)}
                  required
                  className={cn(fieldClass, 'cursor-pointer')}
                >
                  <option value="" disabled>
                    Select a gift type…
                  </option>
                  {GIFT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
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
            <h3
              id={historyHeadingId}
              className="mb-sm text-nano font-semibold uppercase tracking-tag text-ink-dim"
            >
              History
            </h3>

            {status === 'loading' && entries.length === 0 && (
              <p className="flex items-center gap-sm text-caption text-ink-dim">
                <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
                Loading…
              </p>
            )}

            {status !== 'loading' && entries.length === 0 && (
              <p className="text-caption text-ink-dim">No notes yet — the first one you store shows up here.</p>
            )}

            {entries.length > 0 && (
              <ul aria-labelledby={historyHeadingId} className="flex max-h-[220px] flex-col gap-sm overflow-y-auto">
                {entries.map((entry) => (
                  <li key={entry.id} className="rounded-sm bg-bg px-sm py-xs">
                    <div className="flex items-center justify-between gap-sm">
                      <time dateTime={entry.createdAt} className="text-nano font-semibold text-ink-dim">
                        {formatNoteTimestamp(new Date(entry.createdAt))}
                      </time>
                      {entry.giftType && (
                        <span className="text-nano font-semibold text-ink-dim">{entry.giftType}</span>
                      )}
                    </div>
                    <p className="mt-xs whitespace-pre-wrap text-caption text-ink">{entry.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
