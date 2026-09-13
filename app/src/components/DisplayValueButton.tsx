import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Chip, chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { TimeField } from '@/components/ui/TimeField'
import { SleepQualityPicker } from '@/components/editor/SleepQualityPicker'
import { findCard } from '@/data/activities'
import {
  DISPLAY_BUTTONS,
  displayButtonInput,
  displayButtonQuickLogDreamsNote,
  displayButtonQuickLogName,
  displayButtonQuickLogNote,
  displayButtonQuickLogSleepQuality,
  displayButtonQuickLogType,
  displayButtonQuickLogTypeLabel,
  displayButtonSynced,
  displayButtonUnit,
  formatDisplayValue,
  parseDisplayValue,
  type DisplayButtonKey,
} from '@/domain/displayButtons'
import { canSubmitQuickLog, clockToMinutes, durationBetween, formatDuration } from '@/domain/quickLog'
import { validateSchedule, type CandidateSchedule } from '@/domain/scheduling'
import type { ActivityList, SleepQualityId } from '@/domain/types'
import { useDailyValue } from '@/state/useDailyValue'
import { loadDisplayValue, saveDisplayValue } from '@/lib/displayValuesLocalStore'
import { localDateISO } from '@/lib/localTime'
import { cn } from '@/lib/utils'

const PANEL_WIDTH = 280

const fieldClass =
  'w-full rounded-md border border-line bg-surface px-md py-sm text-body font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-dim hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

const textareaClass =
  'w-full resize-y rounded-md border border-line bg-surface px-md py-sm text-body text-ink placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

function labelFor(key: DisplayButtonKey): string {
  return DISPLAY_BUTTONS.find((button) => button.key === key)?.label ?? key
}

/**
 * A header control that always shows a stored number on its face — for the
 * day being viewed — and opens a one-field set/replace editor on click.
 *
 * Two entry modes (`displayButtonInput`): `'number'` types the value in
 * (Steps — a plain per-day local counter; Protein — a synced per-day
 * counter, see `state/useDailyValue.ts`); `'duration'` enters a start and
 * end clock time and stores the minutes between them. For a `quickLogName`
 * button (Vipassana, Exercise, Breathing, Sleep), the face value is a
 * COMPUTED sum of today's real `ScheduledActivity` rows for that catalog
 * name (never a separately stored value), and Save creates one via the
 * shared scheduling module (`domain/scheduling.ts`) — the exact same
 * validation every other placement in this app goes through, so a session
 * that would overlap something already on the board is rejected with an
 * inline message instead of silently vanishing or silently moving. A
 * quick-log button may additionally offer a single-select "type" field (its
 * options are that catalog card's own `sub` list — see
 * `domain/displayButtons.ts`), a plain note field, and — Sleep only — the
 * "How was your sleep?" multi-select and a separate "Dreams" note. No
 * history list here (kept close to the original shell) — every session still
 * shows up on the Timeline strip itself, same as any other logged activity,
 * and is editable there via the existing `editActivity` flow.
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
  onQuickLog: (
    cardName: string,
    startMinutes: number,
    durationMinutes: number,
    extra?: {
      path?: string[]
      notes?: string | null
      sleepQuality?: SleepQualityId[]
      dreamsNote?: string | null
    },
  ) => void
}) {
  const dayKey = localDateISO(viewedDate)
  const quickLogName = displayButtonQuickLogName(buttonKey)
  const synced = displayButtonSynced(buttonKey)
  const hasType = displayButtonQuickLogType(buttonKey)
  const hasNote = displayButtonQuickLogNote(buttonKey)
  const hasSleepQuality = displayButtonQuickLogSleepQuality(buttonKey)
  const hasDreamsNote = displayButtonQuickLogDreamsNote(buttonKey)
  const typeOptions = hasType ? (findCard(quickLogName ?? '')?.sub ?? []) : []

  const [localValue, setLocalValue] = useState<number | null>(() =>
    quickLogName || synced ? null : loadDisplayValue(buttonKey, dayKey),
  )
  // Synced buttons (Protein) always call the hook (rules of hooks); it no-ops
  // internally for every other button (see `useDailyValue`'s own `enabled`).
  const dailyValue = useDailyValue(buttonKey, buttonKey, dayKey, synced)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [type, setType] = useState('')
  const [note, setNote] = useState('')
  const [sleepQuality, setSleepQuality] = useState<SleepQualityId[]>([])
  const [dreamsNote, setDreamsNote] = useState('')
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
    : synced
      ? dailyValue.value
      : localValue

  // The local-counter face value is per viewed day — re-read whenever the
  // header date moves. Not applicable to a quick-log or synced button (both
  // computed/loaded above).
  useEffect(() => {
    if (quickLogName || synced) return
    setLocalValue(loadDisplayValue(buttonKey, dayKey))
  }, [buttonKey, dayKey, quickLogName, synced])

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
    setType('')
    setNote('')
    setSleepQuality([])
    setDreamsNote('')
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
    if (synced) {
      dailyValue.setValue(next)
    } else {
      saveDisplayValue(buttonKey, dayKey, next)
      setLocalValue(next)
    }
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
        activity: { name: quickLogName, path: type ? [type] : [] },
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

      onQuickLog(quickLogName, startMinutes, durationMinutes, {
        path: type ? [type] : [],
        notes: hasNote && note.trim() ? note : null,
        sleepQuality: hasSleepQuality ? sleepQuality : [],
        dreamsNote: hasDreamsNote && dreamsNote.trim() ? dreamsNote : null,
      })
      setStart('')
      setEnd('')
      setType('')
      setNote('')
      setSleepQuality([])
      setDreamsNote('')
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
            'absolute top-[calc(100%+8px)] z-30 w-[min(280px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2',
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

                {hasType && typeOptions.length > 0 && (
                  <fieldset className="flex flex-col gap-sm">
                    <legend className="text-caption font-semibold text-ink-dim">
                      {displayButtonQuickLogTypeLabel(buttonKey)}
                    </legend>
                    <div role="radiogroup" aria-label={displayButtonQuickLogTypeLabel(buttonKey)} className="flex flex-wrap gap-sm">
                      {typeOptions.map((option) => {
                        const isSelected = type === option
                        return (
                          <Chip
                            key={option}
                            as="button"
                            size="xs"
                            tone={isSelected ? 'active' : 'surface'}
                            interactive
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => setType(isSelected ? '' : option)}
                          >
                            {option}
                          </Chip>
                        )
                      })}
                    </div>
                  </fieldset>
                )}

                {hasSleepQuality && <SleepQualityPicker selected={sleepQuality} onToggle={(q) => setSleepQuality((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]))} />}

                {hasNote && (
                  <div>
                    <label htmlFor={`${inputId}-note`} className="mb-xs block text-caption font-semibold text-ink-dim">
                      Note
                    </label>
                    <textarea
                      id={`${inputId}-note`}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Add a note"
                      rows={2}
                      className={textareaClass}
                    />
                  </div>
                )}

                {hasDreamsNote && (
                  <div>
                    <label htmlFor={`${inputId}-dreams`} className="mb-xs block text-caption font-semibold text-ink-dim">
                      Dreams
                    </label>
                    <textarea
                      id={`${inputId}-dreams`}
                      value={dreamsNote}
                      onChange={(event) => setDreamsNote(event.target.value)}
                      placeholder="Dreams"
                      rows={2}
                      className={textareaClass}
                    />
                  </div>
                )}

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
