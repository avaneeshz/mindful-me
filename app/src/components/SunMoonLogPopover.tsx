import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  SUN_MOON_HEADING,
  canSubmitSunMoon,
  durationMinutes,
  entriesForDay,
  formatClock,
  formatDuration,
  totalMinutesForDay,
  type SunMoonKind,
} from '@/domain/sunMoonLog'
import { useSunMoonLog } from '@/state/useSunMoonLog'
import { localDateISO } from '@/lib/localTime'
import { TimeField } from '@/components/ui/TimeField'

/**
 * The timeline end-cap, made a logging control. Tapping the Sun cap (Day row)
 * or the Moon cap (Night row) opens an anchored popover to record a stretch
 * of time in that light by start/end clock time, filed under the day the
 * board is currently viewing. Its history section shows only that day's
 * stretches, and only when there is at least one.
 *
 * Owns the cap `<button>` itself so the whole trigger + popover unit lives in
 * one place. Follows `NoteButtonPill` / `HeaderBar`'s existing popover pattern
 * (`open` state + outside-mousedown/Escape close + focus-return) rather than a
 * Radix dialog — same reasoning as `NoteButtonPill`'s own comment.
 */
export function SunMoonLogPopover({
  kind,
  viewedDate,
  icon: Icon,
  capClassName,
}: {
  kind: SunMoonKind
  viewedDate: Date
  icon: LucideIcon
  /** The end-cap's own visual classes, computed by `TimelineRow` (size + current-period glow). */
  capClassName: string
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const savedFlashTimeoutRef = useRef<number | undefined>(undefined)

  const startId = useId()
  const endId = useId()

  const { entries, addEntry } = useSunMoonLog(kind)
  const heading = SUN_MOON_HEADING[kind]
  const dayKey = localDateISO(viewedDate)
  const dayEntries = entriesForDay(entries, dayKey)
  const dayTotal = totalMinutesForDay(entries, dayKey)
  const canSubmit = canSubmitSunMoon(start, end)

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
    if (open) startRef.current?.focus()
  }, [open])

  useEffect(() => {
    return () => window.clearTimeout(savedFlashTimeoutRef.current)
  }, [])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    addEntry(dayKey, start, end)
    setStart('')
    setEnd('')
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
        aria-label={kind === 'sun' ? 'Log sun exposure' : 'Log moon exposure'}
        onClick={() => setOpen((value) => !value)}
        className={capClassName}
      >
        <Icon aria-hidden="true" className="size-[18px] mobile:size-[15px]" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={heading}
          className="absolute left-0 top-[calc(100%+8px)] z-30 w-[min(320px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2"
        >
          <div className="mb-md flex items-center justify-between">
            <h2 className="text-body font-semibold text-ink">
              {heading}
              {dayTotal > 0 && <span className="ml-sm text-caption font-normal text-ink-dim">· {formatDuration(dayTotal)}</span>}
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

          <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
            {/* Stacked, not side-by-side: each row is a time field plus its
                AM/PM toggle, which two-up overflowed and overlapped inside
                this ~320px popover on tablet widths. */}
            <div className="flex flex-col gap-sm">
              <div>
                <label htmlFor={startId} className="mb-xs block text-caption font-semibold text-ink-dim">
                  Start
                </label>
                <TimeField id={startId} inputRef={startRef} value={start} onChange={setStart} ariaLabel="Start time" />
              </div>
              <div>
                <label htmlFor={endId} className="mb-xs block text-caption font-semibold text-ink-dim">
                  End
                </label>
                <TimeField id={endId} value={end} onChange={setEnd} ariaLabel="End time" />
              </div>
            </div>

            <div className="flex items-center gap-sm">
              <Button type="submit" size="control" disabled={!canSubmit}>
                Store
              </Button>
              {justSaved && (
                <span role="status" className="text-caption font-semibold text-ink-dim">
                  Saved.
                </span>
              )}
            </div>
          </form>

          {dayEntries.length > 0 && (
            <div className="mt-lg border-t border-line pt-md">
              <p className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Today</p>
              <ul className="mt-sm flex max-h-[200px] flex-col gap-sm overflow-y-auto">
                {dayEntries.map((entry) => (
                  <li key={entry.id} className="rounded-sm bg-bg px-sm py-xs text-caption text-ink">
                    {formatClock(entry.start)} – {formatClock(entry.end)}
                    <span className="text-ink-dim">
                      {' · '}
                      {formatDuration(durationMinutes(entry.start, entry.end) ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
