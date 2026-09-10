import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { TimeField } from '@/components/ui/TimeField'
import {
  DISPLAY_BUTTONS,
  displayButtonInput,
  displayButtonQuickLogName,
  displayButtonUnit,
  formatDisplayValue,
  parseDisplayValue,
  type DisplayButtonKey,
} from '@/domain/displayButtons'
import { canSubmitQuickLog, clockToMinutes, durationBetween, formatDuration } from '@/domain/quickLog'
import { validateSchedule, type CandidateSchedule } from '@/domain/scheduling'
import type { ActivityList } from '@/domain/types'
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
 * day being viewed — and opens a one-field set/replace editor on click.
 *
 * Two entry modes (`displayButtonInput`): `'number'` types the value in
 * (Steps — a plain per-day local counter, unrelated to the scheduling
 * engine); `'duration'` enters a start and end clock time and stores the
 * minutes between them. For a `quickLogName` button (Vipassana), the face
 * value is a COMPUTED sum of today's real `ScheduledActivity` rows for that
 * catalog name (never a separately stored value), and Save creates one via
 * the shared scheduling module (`domain/scheduling.ts`) — the exact same
 * validation every other placement in this app goes through, so a session
 * that would overlap something already on the board is rejected with an
 * inline message instead of silently vanishing or silently moving. No
 * history list here (kept close to the original shell) — every session still
 * shows up on the Timeline strip itself, same as any other logged activity.
 */
export function DisplayValueButton({
  buttonKey,
  viewedDate,
  activities,
  onQuickLog,
}: {
  buttonKey: DisplayButtonKey
  viewedDate: Date
  /** Today's board — only read for a `quickLogName` button's computed total/validation. */
  activities: ActivityList
  /** Dispatches `quickLogActivity` — see `state/boardReducer.ts`. Unused for a plain local counter. */
  onQuickLog: (cardName: string, startMinutes: number, durationMinutes: number) => void
}) {
  const dayKey = localDateISO(viewedDate)
  const quickLogName = displayButtonQuickLogName(buttonKey)

  const [localValue, setLocalValue] = useState<number | null>(() =>
    quickLogName ? null : loadDisplayValue(buttonKey, dayKey),
  )
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [align, setAlign] = useState<'left' | 'right'>('right')
  const [error, setError] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const label = labelFor(buttonKey)
  const unit = displayButtonUnit(buttonKey)
  const mode = displayButtonInput(buttonKey)
  const durationDraft = mode === 'duration' ? durationBetween(start, end) : null
  const canSave = mode === 'duration' ? canSubmitQuickLog(start, end) : true

  // The computed total (quick-log) is derived on every render from the board
  // itself — no separate load effect needed, unlike the local-counter path.
  const value = quickLogName
    ? (() => {
        const total = activities
          .filter((a) => a.name === quickLogName)
          .reduce((sum, a) => sum + a.durationMinutes, 0)
        return total > 0 ? total : null
      })()
    : localValue

  // The local-counter face value is per viewed day — re-read whenever the
  // header date moves. Not applicable to a quick-log button (computed above).
  useEffect(() => {
    if (quickLogName) return
    setLocalValue(loadDisplayValue(buttonKey, dayKey))
  }, [buttonKey, dayKey, quickLogName])

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
    setDraft(localValue === null ? '' : String(localValue))
    setStart('')
    setEnd('')
    setError(null)
    // Anchor the popover to whichever edge keeps it on screen: expand right
    // from the trigger when there is room, otherwise expand left.
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setAlign(rect.left + PANEL_WIDTH <= window.innerWidth - 16 ? 'left' : 'right')
    }
    setOpen(true)
  }

  function commitLocal(next: number | null) {
    saveDisplayValue(buttonKey, dayKey, next)
    setLocalValue(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (quickLogName) {
      const durationMinutes = durationBetween(start, end)
      const startMinutes = clockToMinutes(start)
      if (durationMinutes === null || startMinutes === null || !canSave) return

      // Validated here (not just inside the reducer) so a real conflict can
      // show an inline message rather than the request silently no-oping —
      // same shared-scheduling-module contract every other placement uses.
      const candidate: CandidateSchedule = {
        id: null,
        activity: { name: quickLogName, path: [] },
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

      onQuickLog(quickLogName, startMinutes, durationMinutes)
      setStart('')
      setEnd('')
      setError(null)
      setOpen(false)
      triggerRef.current?.focus()
      return
    }

    if (mode === 'duration') {
      if (!canSave) return
      commitLocal(durationBetween(start, end))
      return
    }
    commitLocal(parseDisplayValue(draft))
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
                {error && (
                  <p role="alert" className="rounded-md border border-ink bg-ink/10 px-md py-sm text-caption font-semibold text-ink">
                    {error}
                  </p>
                )}
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
