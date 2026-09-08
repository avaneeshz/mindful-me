import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import {
  DISPLAY_BUTTONS,
  displayButtonUnit,
  formatDisplayValue,
  parseDisplayValue,
  type DisplayButtonKey,
} from '@/domain/displayButtons'
import { loadDisplayValue, saveDisplayValue } from '@/lib/displayValuesLocalStore'
import { localDateISO } from '@/lib/localTime'
import { cn } from '@/lib/utils'

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

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const label = labelFor(buttonKey)
  const unit = displayButtonUnit(buttonKey)

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
    setOpen(true)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseDisplayValue(draft)
    saveDisplayValue(buttonKey, dayKey, parsed)
    setValue(parsed)
    setOpen(false)
    triggerRef.current?.focus()
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
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(240px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2 mobile:left-0 mobile:right-auto"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
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
            <Button type="submit" size="control">
              Save
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
