import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, buildMonthGrid, daysInMonth, startOfMonth } from '@/domain/calendar'
import { localDateISO } from '@/lib/localTime'
import { cn } from '@/lib/utils'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export interface DatePickerProps {
  /** The date currently shown on screen. */
  viewedDate: Date
  /** Real device "today" — the picker's own reference, never a fixed value. */
  today: Date
  onSelect: (date: Date) => void
  onClose: () => void
}

/**
 * BL-2 — a month-grid date picker, any past or future date selectable (no
 * min/max). Built from scratch (no new dependency — CLAUDE.md forbids
 * introducing a UI library without approval, and none of the ones already in
 * use ship a calendar), following the same patterns already established on
 * this screen: outside-click + Escape to close (mirrors `HeaderBar`'s
 * `AccountMenu`), roving-tabindex arrow-key grid navigation (mirrors
 * `Timeline`'s slot grid).
 */
export function DatePicker({ viewedDate, today, onSelect, onClose }: DatePickerProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(viewedDate))
  const [focusedDate, setFocusedDate] = useState(viewedDate)
  const gridRef = useRef<HTMLDivElement>(null)

  const grid = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth])
  const todayIso = localDateISO(today)
  const selectedIso = localDateISO(viewedDate)
  const focusedIso = localDateISO(focusedDate)

  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedIso}"]`)?.focus()
    // Only when focusedDate itself changes — re-running on every `grid`
    // rebuild would steal focus back from whatever the user just tabbed to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIso])

  /**
   * Moves BOTH the visible month AND grid keyboard focus together, in the
   * one direction that's ever needed: focus leads, the visible month follows
   * it across a boundary. The Prev/Next buttons below are the other
   * direction — visible month leads, focus follows — handled separately by
   * `goToMonth`. Keeping these as two plain functions (not a bidirectional
   * effect watching both pieces of state) is deliberate: an effect that
   * reacts to either one changing fights the other's own explicit change on
   * every render, which is exactly the bug an earlier version of this
   * component had (Previous/Next snapped straight back to the start month).
   */
  function moveFocus(deltaDays: number) {
    const next = new Date(focusedDate)
    next.setDate(next.getDate() + deltaDays)
    setFocusedDate(next)
    if (next.getMonth() !== visibleMonth.getMonth() || next.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(startOfMonth(next))
    }
  }

  /** Prev/Next month buttons: change the visible month, and bring focus along (clamped to a real day). */
  function goToMonth(newMonth: Date) {
    setVisibleMonth(newMonth)
    setFocusedDate((prev) => {
      const day = Math.min(prev.getDate(), daysInMonth(newMonth))
      return new Date(newMonth.getFullYear(), newMonth.getMonth(), day)
    })
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(-1)
        break
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(-7)
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(7)
        break
      case 'Home':
        event.preventDefault()
        moveFocus(-focusedDate.getDay())
        break
      case 'End':
        event.preventDefault()
        moveFocus(6 - focusedDate.getDay())
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onSelect(focusedDate)
        break
      case 'Escape':
        event.preventDefault()
        onClose()
        break
      default:
        break
    }
  }

  const navButton =
    'flex size-stepper items-center justify-center rounded-full text-ink transition-colors hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  return (
    <div
      role="dialog"
      aria-label="Choose a date"
      // Anchored to the trigger's RIGHT edge everywhere the trigger itself
      // sits in the header's right-side cluster (tablet/desktop) — but on
      // mobile the date pill is the leading control in its row (the weather
      // pill beside it is hidden there), close to the LEFT edge of a narrow
      // viewport, so a right-anchored 288px popover would overflow off the
      // left edge entirely. Below the `mobile` breakpoint it anchors from
      // the trigger's left edge instead, which comfortably fits open toward
      // the page's own centre.
      className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(288px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2 mobile:left-0 mobile:right-auto"
    >
      <div className="mb-sm flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goToMonth(addMonths(visibleMonth, -1))}
          className={navButton}
        >
          <ChevronLeft aria-hidden="true" className="size-[16px]" />
        </button>
        <span className="text-body font-semibold text-ink" aria-live="polite">
          {formatMonthLabel(visibleMonth)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goToMonth(addMonths(visibleMonth, 1))}
          className={navButton}
        >
          <ChevronRight aria-hidden="true" className="size-[16px]" />
        </button>
      </div>

      <div className="mb-xs grid grid-cols-7 text-center text-nano font-semibold uppercase tracking-tag text-ink-dim">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={`${label}-${index}`} className="py-xs">
            {label}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="group"
        aria-label={formatMonthLabel(visibleMonth)}
        onKeyDown={handleGridKeyDown}
        className="grid grid-cols-7 gap-[2px]"
      >
        {grid.map((date) => {
          const iso = localDateISO(date)
          const inMonth = date.getMonth() === visibleMonth.getMonth()
          const isSelected = iso === selectedIso
          const isToday = iso === todayIso
          return (
            <button
              key={iso}
              type="button"
              data-date={iso}
              tabIndex={iso === focusedIso ? 0 : -1}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              aria-label={formatDayLabel(date)}
              onFocus={() => setFocusedDate(date)}
              onClick={() => onSelect(date)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-full text-caption font-semibold transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                !inMonth && 'text-ink-dim/50 hover:bg-bg',
                inMonth && !isSelected && 'text-ink hover:bg-bg',
                isSelected && 'bg-inv-bg text-inv-ink hover:bg-inv-bg',
                !isSelected && isToday && 'ring-1 ring-inset ring-ink',
              )}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>

      {selectedIso !== todayIso && (
        <button
          type="button"
          onClick={() => onSelect(today)}
          className="mt-sm w-full rounded-sm py-sm text-center text-caption font-semibold text-ink transition-colors hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Jump to today
        </button>
      )}
    </div>
  )
}
