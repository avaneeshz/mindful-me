import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { chipVariants } from '@/components/ui/chip'
import { supplementItemLabel, type SupplementCompletion, type SupplementItemKey } from '@/domain/supplements'
import type { HeaderButtonConfig } from '@/domain/headerButtons'
import { useSupplementCompletions } from '@/state/useSupplementCompletions'
import { localDateISO } from '@/lib/localTime'
import { cn } from '@/lib/utils'

const PANEL_WIDTH = 320

/**
 * A `'checklist'`-category header control — an independently-toggleable
 * item list with a per-item optional note, one instance of a checklist that
 * "resets daily" — see `domain/supplements.ts`'s own doc comment.
 * Generalizes the original `SupplementsButton` (which this file replaces)
 * from "the one hardcoded Supplements checklist" to any checklist-category
 * `HeaderButtonConfig`, so a user-added checklist renders through the exact
 * same component. Per CLAUDE.md's Component Rule this deliberately reuses
 * as much of the EXISTING popover chrome as still applies and no more —
 * `NoteButtonPill`'s own trigger-button/`open`-state/outside-click-and-
 * Escape-to-close/focus-return pattern.
 *
 * Resets daily (confirmed requirement): the day's checklist is derived fresh
 * from `viewedDate` — see `state/useSupplementCompletions.ts` — so switching
 * days always shows that day's own item state, all unchecked until touched
 * (rule 12 — editing a past day is always allowed, since nothing here is
 * scoped to "today" specifically).
 */
export function ChecklistButton({ button, viewedDate }: { button: HeaderButtonConfig; viewedDate: Date }) {
  const [open, setOpen] = useState(false)
  const [align, setAlign] = useState<'left' | 'right'>('left')
  const [expandedNotes, setExpandedNotes] = useState<Set<SupplementItemKey>>(new Set())
  const [noteDrafts, setNoteDrafts] = useState<Partial<Record<SupplementItemKey, string>>>({})

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headingId = useId()

  const items = button.checklistItems
  const localDate = localDateISO(viewedDate)
  const { checklist, status, error, setCompletion } = useSupplementCompletions(button.id, items, localDate, open)
  const doneCount = checklist.filter((entry) => entry.done).length

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

  useEffect(() => {
    if (!open) {
      setExpandedNotes(new Set())
      setNoteDrafts({})
    }
  }, [open])

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        const rect = triggerRef.current?.getBoundingClientRect()
        if (rect) {
          setAlign(rect.left + PANEL_WIDTH <= window.innerWidth - 16 ? 'left' : 'right')
        }
      }
      return !wasOpen
    })
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function draftFor(entry: SupplementCompletion): string {
    return noteDrafts[entry.itemKey] ?? entry.note
  }

  function toggleDone(entry: SupplementCompletion) {
    void setCompletion(entry.itemKey, !entry.done, draftFor(entry))
  }

  function toggleNoteExpanded(itemKey: SupplementItemKey) {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      if (next.has(itemKey)) next.delete(itemKey)
      else next.add(itemKey)
      return next
    })
  }

  function saveNote(entry: SupplementCompletion) {
    void setCompletion(entry.itemKey, entry.done, draftFor(entry))
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${button.label}, ${doneCount} of ${checklist.length} taken`}
        onClick={toggle}
        className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
      >
        <span>{button.label}</span>
        {/* The 0–N fraction read as a score to chase, not a status — dropped
            per product feedback. In its place: a quiet tick once the day is
            "mostly done" (>= half), same threshold-not-count treatment as a
            habit-tracker check-in rather than a running tally. The exact
            count is still in `aria-label` above for assistive tech, just not
            painted here. */}
        {items.length > 0 && doneCount >= Math.ceil(items.length / 2) && (
          <Check aria-hidden="true" className="size-[14px] text-ink-dim" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-labelledby={headingId}
          className={cn(
            'absolute top-[calc(100%+8px)] z-30 w-[min(320px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          <div className="mb-md flex items-center justify-between">
            <h2 id={headingId} className="text-body font-semibold text-ink">
              {button.label}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="flex size-stepper items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
            >
              <X aria-hidden="true" className="size-[16px]" />
            </button>
          </div>

          {status === 'loading' && checklist.every((entry) => !entry.done && entry.note === '') && (
            <p className="mb-sm flex items-center gap-sm text-caption text-ink-dim">
              <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
              Loading…
            </p>
          )}

          {error && (
            <p role="alert" className="mb-sm text-caption font-semibold text-ink-dim">
              {error}
            </p>
          )}

          {checklist.length === 0 ? (
            <p className="text-caption text-ink-dim">No items configured for this checklist yet.</p>
          ) : (
            <ul className="flex flex-col gap-xs">
              {checklist.map((entry) => {
                const noteOpen = expandedNotes.has(entry.itemKey) || entry.note !== ''
                return (
                  <li key={entry.itemKey} className="rounded-sm">
                    <div className="flex items-center gap-sm py-xs">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={entry.done}
                        aria-label={supplementItemLabel(items, entry.itemKey)}
                        onClick={() => toggleDone(entry)}
                        className={cn(
                          'flex size-[20px] shrink-0 items-center justify-center rounded-sm border transition-colors',
                          entry.done ? 'border-ink bg-ink text-inv-ink' : 'border-line bg-surface text-transparent',
                        )}
                      >
                        <Check aria-hidden="true" className="size-[14px]" />
                      </button>
                      <span
                        className={cn(
                          'flex-1 text-body text-ink',
                          entry.done && 'text-ink-dim line-through decoration-ink-dim/60',
                        )}
                      >
                        {supplementItemLabel(items, entry.itemKey)}
                      </span>
                      <button
                        type="button"
                        aria-expanded={noteOpen}
                        aria-label={`${entry.note ? 'Edit' : 'Add'} note for ${supplementItemLabel(items, entry.itemKey)}`}
                        onClick={() => toggleNoteExpanded(entry.itemKey)}
                        className="flex size-stepper shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={cn('size-[14px] transition-transform', noteOpen && 'rotate-180')}
                        />
                      </button>
                    </div>

                    {noteOpen && (
                      <div className="mb-sm pl-[28px]">
                        <label htmlFor={`checklist-note-${button.id}-${entry.itemKey}`} className="sr-only">
                          Note for {supplementItemLabel(items, entry.itemKey)}
                        </label>
                        <textarea
                          id={`checklist-note-${button.id}-${entry.itemKey}`}
                          value={draftFor(entry)}
                          onChange={(event) =>
                            setNoteDrafts((prev) => ({ ...prev, [entry.itemKey]: event.target.value }))
                          }
                          onBlur={() => saveNote(entry)}
                          placeholder="Add a note"
                          rows={2}
                          className="w-full resize-y rounded-md border border-line bg-bg px-sm py-xs text-caption text-ink placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
