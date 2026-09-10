import { useEffect, useRef, useState, type Ref } from 'react'
import {
  currentMeridiem,
  formatClockText,
  from24Hour,
  parseClockText,
  to24Hour,
  type Meridiem,
} from '@/domain/timeInput'
import { cn } from '@/lib/utils'

/**
 * A keyboard-first clock-time input: type the digits (`230`, `2:30`, `9`) and
 * an AM/PM toggle beside them. No native `<input type="time">` — that renders
 * as a device spinner on iPad/iOS with no reliable keyboard path, and its
 * intrinsic width overflowed the narrow popovers it lived in. This is a plain
 * text field on every device, always the same width.
 *
 * The meridiem defaults to the current wall-clock half of the day and flips on
 * tap. `value` is the `HH:MM` 24-hour string the domain speaks
 * (`domain/timeInput.ts`), or `''` while the field does not hold a real time.
 */
export function TimeField({
  id,
  value,
  onChange,
  inputRef,
  ariaLabel,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement>
  ariaLabel?: string
  className?: string
}) {
  const [text, setText] = useState('')
  const [meridiem, setMeridiem] = useState<Meridiem>(() => currentMeridiem())
  const focusedRef = useRef(false)
  const lastValueRef = useRef(value)

  // Re-sync from `value` only when it changes from the OUTSIDE (a parent
  // reset to '', or a prefilled edit) — never while the user is typing, so
  // canonicalising "2" → "2:00" can't fight a half-entered "2:30".
  useEffect(() => {
    if (value === lastValueRef.current) return
    lastValueRef.current = value

    if (value === '') {
      setText('')
      setMeridiem(currentMeridiem())
      return
    }
    if (focusedRef.current) return
    const parts = from24Hour(value)
    if (parts) {
      setText(formatClockText(parts.h12, parts.minute))
      setMeridiem(parts.meridiem)
    }
  }, [value])

  function emit(nextText: string, nextMeridiem: Meridiem) {
    const parsed = parseClockText(nextText)
    const next = parsed ? to24Hour(parsed.h12, parsed.minute, nextMeridiem) : ''
    lastValueRef.current = next
    onChange(next)
  }

  function handleTextChange(raw: string) {
    const cleaned = raw.replace(/[^\d:]/g, '').slice(0, 5)
    setText(cleaned)
    emit(cleaned, meridiem)
  }

  function handleBlur() {
    focusedRef.current = false
    const parsed = parseClockText(text)
    if (parsed) setText(formatClockText(parsed.h12, parsed.minute))
  }

  function toggleMeridiem() {
    const next: Meridiem = meridiem === 'AM' ? 'PM' : 'AM'
    setMeridiem(next)
    emit(text, next)
  }

  return (
    <div className={cn('flex items-stretch gap-xs', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0:00"
        aria-label={ariaLabel}
        value={text}
        onFocus={() => {
          focusedRef.current = true
        }}
        onChange={(event) => handleTextChange(event.target.value)}
        onBlur={handleBlur}
        className="w-full min-w-0 rounded-md border border-line bg-surface px-md py-sm text-body font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-dim hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
      <button
        type="button"
        onClick={toggleMeridiem}
        aria-label={`Switch to ${meridiem === 'AM' ? 'PM' : 'AM'} — currently ${meridiem}`}
        className="shrink-0 rounded-md border border-line bg-surface px-sm text-caption font-semibold text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {meridiem}
      </button>
    </div>
  )
}
