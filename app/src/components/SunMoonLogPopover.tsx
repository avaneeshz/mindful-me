import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canSubmitQuickLog, clockToMinutes, durationBetween, formatClock, formatDuration } from '@/domain/quickLog'
import { validateSchedule, type CandidateSchedule } from '@/domain/scheduling'
import { clockMinutesToBoard } from '@/domain/window'
import type { ActivityList } from '@/domain/types'
import { TimeField } from '@/components/ui/TimeField'

export type SunMoonKind = 'sun' | 'moon'

const SUN_MOON_HEADING: Record<SunMoonKind, string> = {
  sun: 'Sun Exposure',
  moon: 'Moon Exposure',
}

/**
 * The timeline end-cap, made a logging control. Tapping the Sun cap (Day row)
 * or the Moon cap (Night row) opens an anchored popover to record a stretch
 * of time in that light by start/end clock time.
 *
 * Backed by the real scheduling engine now (`entry_mode: 'quick_log'` — see
 * the full-stack-engineer agent definition's Phase 2 scope): each stretch is
 * an ordinary `ScheduledActivity` named "Sun Exposure"/"Moon Exposure",
 * created through the SAME `validateSchedule`/shared-scheduling-module
 * contract every other placement uses, so an entry that would overlap
 * something already on the board is rejected with an inline message rather
 * than silently vanishing. Its history section reads directly off the
 * board's own `activities` (already scoped to the viewed day by
 * `BoardContext`) instead of a separate local-only log.
 *
 * Owns the cap `<button>` itself so the whole trigger + popover unit lives in
 * one place. Follows `NoteButtonPill` / `HeaderBar`'s existing popover pattern
 * (`open` state + outside-mousedown/Escape close + focus-return) rather than a
 * Radix dialog — same reasoning as `NoteButtonPill`'s own comment.
 */
export function SunMoonLogPopover({
  kind,
  icon: Icon,
  capClassName,
  activities,
  onQuickLog,
}: {
  kind: SunMoonKind
  icon: LucideIcon
  /** The end-cap's own visual classes, computed by `TimelineRow` (size + current-period glow). */
  capClassName: string
  /** The viewed day's board — read for today's history/total and to validate a new entry before it commits. */
  activities: ActivityList
  /** Dispatches `quickLogActivity` — see `state/boardReducer.ts`. */
  onQuickLog: (cardName: string, startMinutes: number, durationMinutes: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const savedFlashTimeoutRef = useRef<number | undefined>(undefined)

  const startId = useId()
  const endId = useId()

  const cardName = SUN_MOON_HEADING[kind]
  const heading = cardName
  const dayEntries = activities
    .filter((a) => a.name === cardName)
    .slice()
    .sort((a, b) => b.startMinutes - a.startMinutes)
  const dayTotal = dayEntries.reduce((sum, a) => sum + a.durationMinutes, 0)
  const canSubmit = canSubmitQuickLog(start, end)

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
    const durationMinutes = durationBetween(start, end)
    const clockMinutes = clockToMinutes(start)
    if (!canSubmit || durationMinutes === null || clockMinutes === null) return

    // The board (`domain/window.ts`) runs 06:00 → 06:00: a "02:00" here means
    // the small hours of the following morning, board minute 1560.
    const startMinutes = clockMinutesToBoard(clockMinutes)
    const candidate: CandidateSchedule = {
      id: null,
      activity: { name: cardName, path: [] },
      startMinutes,
      durationMinutes,
    }
    const validation = validateSchedule(candidate, activities)
    if (!validation.ok) {
      setError(
        validation.reason === 'occupied'
          ? 'That time overlaps something already on the board.'
          : 'That doesn’t fit before something else starts — try a shorter stretch or a different time.',
      )
      return
    }

    onQuickLog(cardName, startMinutes, durationMinutes)
    setStart('')
    setEnd('')
    setError(null)
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

            {error && (
              <p role="alert" className="rounded-md border border-ink bg-ink/10 px-md py-sm text-caption font-semibold text-ink">
                {error}
              </p>
            )}

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
                    {formatClock(minutesToClock(entry.startMinutes))} ·{' '}
                    <span className="text-ink-dim">{formatDuration(entry.durationMinutes)}</span>
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

/** Minutes since local midnight (may be >= 1440 for a midnight-crossing entry's end, never its own start) → `"HH:MM"`. */
function minutesToClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
