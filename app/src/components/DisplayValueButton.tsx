import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { TimeField } from '@/components/ui/TimeField'
import {
  DISPLAY_BUTTONS,
  displayButtonInput,
  displayButtonUnit,
  formatDisplayValue,
  parseDisplayValue,
  type DisplayButtonKey,
} from '@/domain/displayButtons'
import { canSubmitSunMoon, durationMinutes, formatDuration } from '@/domain/sunMoonLog'
import { loadDisplayValue, saveDisplayValue } from '@/lib/displayValuesLocalStore'
import { localDateISO } from '@/lib/localTime'
import { cn } from '@/lib/utils'

const PANEL_WIDTH = 240

const fieldClass =
  'w-full rounded-md border border-line bg-surface px-md py-sm text-body font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-dim hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

function labelFor(key: DisplayButtonKey): string {
  return DISPLAY_BUTTONS.find((button) => button.key === key)?.label ?? key
}

/**
 * A header control that always shows a stored number on its face — for the
 * day being viewed — and opens a one-field set/replace editor on click. No
 * history. Follows the same anchored-popover pattern as `NoteButtonPill`
 * (open state + outside-mousedown/Escape close + focus-return).
 *
 * Two entry modes (`displayButtonInput`): `'number'` types the value in;
 * `'duration'` (Vipassana) enters a start and end clock time and stores the
 * minutes between them, so a sit is logged the same way as Sun / Moon
 * exposure but still reads as a minute count on the button face.
 */
export function DisplayValueButton({
  buttonKey,
  viewedDate,
}: {
  buttonKey: DisplayButtonKey
  viewedDate: Date
}) {
  const dayKey = localDateISO(viewedDate)
  const [value, setValue] = useState<number | null>(() => loadDisplayValue(buttonKey, dayKey))
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [align, setAlign] = useState<'left' | 'right'>('right')

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const label = labelFor(buttonKey)
  const unit = displayButtonUnit(buttonKey)
  const mode = displayButtonInput(buttonKey)
  const durationDraft = mode === 'duration' ? durationMinutes(start, end) : null
  const canSave = mode === 'duration' ? canSubmitSunMoon(start, end) : true

  // The face value is per viewed day — re-read whenever the header date moves.
  useEffect(() => {
    setValue(loadDisplayValue(buttonKey, dayKey))
  }, [buttonKey, dayKey])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
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
    if (open) inputRef.current?.focus()
  }, [open])

  function openEditor() {
    setDraft(value === null ? '' : String(value))
    setStart('')
    setEnd('')
    // Anchor the popover to whichever edge keeps it on screen: expand right
    // from the trigger when there is room, otherwise expand left.
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setAlign(rect.left + PANEL_WIDTH <= window.innerWidth - 16 ? 'left' : 'right')
    }
    setOpen(true)
  }

  function commit(next: number | null) {
    saveDisplayValue(buttonKey, dayKey, next)
    setValue(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'duration') {
      if (!canSave) return
      commit(durationMinutes(start, end))
      return
    }
    commit(parseDisplayValue(draft))
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}${value === null ? '' : `, ${formatDisplayValue(buttonKey, value)}`} — set value`}
        onClick={() => (open ? setOpen(false) : openEditor())}
        className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
      >
        <span>{label}</span>
        <span className="text-ink-dim">{formatDisplayValue(buttonKey, value)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} value`}
          className={cn(
            'absolute top-[calc(100%+8px)] z-30 w-[min(240px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
            {mode === 'duration' ? (
              <>
                <div>
                  <label htmlFor={inputId} className="mb-xs block text-caption font-semibold text-ink-dim">
                    Start
                  </label>
                  <TimeField id={inputId} inputRef={inputRef} value={start} onChange={setStart} ariaLabel="Start time" />
                </div>
                <div>
                  <label className="mb-xs block text-caption font-semibold text-ink-dim">End</label>
                  <TimeField value={end} onChange={setEnd} ariaLabel="End time" />
                </div>
                <p className="text-caption text-ink-dim">
                  {durationDraft && durationDraft > 0 ? formatDuration(durationDraft) : 'Duration'}
                </p>
              </>
            ) : (
              <>
                <label htmlFor={inputId} className="text-caption font-semibold text-ink-dim">
                  {label} {unit === 'min' ? '(minutes)' : ''}
                </label>
                <input
                  ref={inputRef}
                  id={inputId}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="0"
                  className={fieldClass}
                />
              </>
            )}
            <Button type="submit" size="control" disabled={!canSave}>
              Save
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
