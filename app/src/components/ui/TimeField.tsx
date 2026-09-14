import type { Ref } from 'react'
import { useClockField } from './useClockField'
import { cn } from '@/lib/utils'

/**
 * A keyboard-first clock-time input: type the digits (`230`, `2:30`, `9`) and
 * an AM/PM toggle beside them. No native `<input type="time">` — that renders
 * as a device spinner on iPad/iOS with no reliable keyboard path, and its
 * intrinsic width overflowed the narrow popovers it lived in. This is a plain
 * text field on every device, always the same width.
 *
 * A single standalone time (Worship's Start-only songCount entry — see
 * `displayButtonInput`). Every genuine Start/End PAIR uses `TimeRangeField`'s
 * unified bar instead; this is not that component reduced to one side.
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
  const { text, meridiem, handleFocus, handleTextChange, handleBlur, toggleMeridiem } = useClockField(value, onChange)

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
        onFocus={handleFocus}
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
