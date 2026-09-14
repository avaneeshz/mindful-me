import { useEffect, useRef, useState } from 'react'
import { currentMeridiem, formatClockText, from24Hour, parseClockText, to24Hour, type Meridiem } from '@/domain/timeInput'

/**
 * The keyboard-first clock-time state machine shared by every "type a time"
 * control (`TimeField`'s single input, and each half of `TimeRangeField`'s
 * unified Start/End bar) — extracted so the mount/sync/blur subtleties below
 * exist in exactly one place rather than two near-identical copies.
 *
 * `value` is the `HH:MM` 24-hour string the domain speaks
 * (`domain/timeInput.ts`), or `''` while the field holds no real time.
 */
export function useClockField(value: string, onChange: (value: string) => void) {
  // Lazy initial state, not a fixed `''`/`currentMeridiem()` — a caller may
  // mount this already holding a real value (e.g. defaulting Start to "now"),
  // and the sync effect below only reacts to `value` CHANGING after mount, so
  // without this the field would render blank despite `value` being non-empty.
  const [text, setText] = useState(() => {
    const parts = from24Hour(value)
    return parts ? formatClockText(parts.h12, parts.minute) : ''
  })
  const [meridiem, setMeridiem] = useState<Meridiem>(() => from24Hour(value)?.meridiem ?? currentMeridiem())
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

  function handleFocus() {
    focusedRef.current = true
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

  return { text, meridiem, handleFocus, handleTextChange, handleBlur, toggleMeridiem }
}
