import type { Ref } from 'react'
import { useClockField } from './useClockField'
import { cn } from '@/lib/utils'

/**
 * The Start/End time range control — one bordered bar split by a hairline,
 * not two stacked label+field groups. Picked (as "Unified Bar", prototype 3
 * of 4) over keeping Start and End as separate `TimeField`s each under its
 * own caption: that shape cost four rows (label, field, label, field) for
 * every quick-log popover that takes a time range (Sun/Moon exposure,
 * Vipassana, Exercise, Breathing, Sleep, Prayer, Sermons) — this is one.
 *
 * Same keyboard-only entry as `TimeField` (type the digits, tap AM/PM) —
 * genuinely two of that field's `useClockField` state machines side by side,
 * not a new input pattern. Reach for the plain `TimeField` instead when there
 * is no End (Worship's Start + song-count entry) — this component is
 * specifically the PAIR.
 *
 * Pass the four date props to make each side a DATED row (date picker + time)
 * stacked inside the same bar, so a stretch can start on one day and end on
 * another (Sleep 10 PM → 6 AM). Without them it is the original single-line
 * bar, unchanged. The date is a native `<input type="date">`: unlike a clock
 * time, its OS picker is the better path on touch devices.
 */
export function TimeRangeField({
  startId,
  endId,
  startValue,
  onStartChange,
  endValue,
  onEndChange,
  startInputRef,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  className,
}: {
  startId?: string
  endId?: string
  startValue: string
  onStartChange: (value: string) => void
  endValue: string
  onEndChange: (value: string) => void
  /** Focused on open — same seam `TimeField`'s own callers already use for the Start field. */
  startInputRef?: Ref<HTMLInputElement>
  /** `YYYY-MM-DD`. Supply all four date props together to show dated rows. */
  startDate?: string
  onStartDateChange?: (value: string) => void
  endDate?: string
  onEndDateChange?: (value: string) => void
  className?: string
}) {
  const dated =
    startDate !== undefined && onStartDateChange !== undefined && endDate !== undefined && onEndDateChange !== undefined

  return (
    <div className={cn('flex rounded-md border border-line bg-surface', dated ? 'flex-col' : 'items-stretch', className)}>
      <TimeHalf
        id={startId}
        label="Start"
        value={startValue}
        onChange={onStartChange}
        inputRef={startInputRef}
        ariaLabel="Start time"
        date={dated ? { value: startDate, onChange: onStartDateChange, ariaLabel: 'Start date' } : undefined}
      />
      <div aria-hidden="true" className={dated ? 'h-px shrink-0 bg-line' : 'w-px shrink-0 bg-line'} />
      <TimeHalf
        id={endId}
        label="End"
        value={endValue}
        onChange={onEndChange}
        ariaLabel="End time"
        date={dated ? { value: endDate, onChange: onEndDateChange, ariaLabel: 'End date' } : undefined}
      />
    </div>
  )
}

/** One side of the bar — a real `<label>` (click-to-focus, not just decorative) plus the same digits-and-AM/PM entry `TimeField` uses, laid out inline instead of stacked. */
function TimeHalf({
  id,
  label,
  value,
  onChange,
  inputRef,
  ariaLabel,
  date,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement>
  ariaLabel: string
  /** When set, a date picker sits between the label and the time. */
  date?: { value: string; onChange: (value: string) => void; ariaLabel: string }
}) {
  const { text, meridiem, handleFocus, handleTextChange, handleBlur, toggleMeridiem } = useClockField(value, onChange)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-xs px-sm py-sm">
      <label htmlFor={id} className={cn('shrink-0 text-nano font-semibold uppercase tracking-tag text-ink-dim', date && 'w-8')}>
        {label}
      </label>
      {date && (
        <input
          type="date"
          required
          aria-label={date.ariaLabel}
          value={date.value}
          onChange={(event) => event.target.value && date.onChange(event.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-caption font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      )}
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
        className={cn(
          'min-w-0 border-0 bg-transparent p-0 text-body font-semibold text-ink placeholder:font-normal placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
          date ? 'w-[6ch] shrink-0 text-right' : 'w-full',
        )}
      />
      <button
        type="button"
        onClick={toggleMeridiem}
        aria-label={`Switch to ${meridiem === 'AM' ? 'PM' : 'AM'} — currently ${meridiem}`}
        className="shrink-0 rounded-sm bg-bg px-sm text-caption font-semibold text-ink transition-colors hover:bg-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {meridiem}
      </button>
    </div>
  )
}
