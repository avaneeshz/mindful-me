import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
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
import { formatActivityRange } from '@/domain/slots'
import type { ActivityList, ScheduledActivity, SleepQualityId } from '@/domain/types'
import { useDailyValue } from '@/state/useDailyValue'
import { useDisplayValueHistory, type UseDisplayValueHistoryResult } from '@/state/useDisplayValueHistory'
import { useSessionHistory } from '@/state/useSessionHistory'
import { loadDisplayValue, saveDisplayValue } from '@/lib/displayValuesLocalStore'
import type { DisplayValueHistoryEntry } from '@/lib/displayValuesLocalStore'
import { dateFromLocalDateISO, localDateISO } from '@/lib/localTime'
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
 * "How was your sleep?" multi-select and a separate "Dreams" note.
 *
 * Below the editor sits a two-part history, split the same way on both
 * shapes this button covers — an always-visible "Recent" list (today/the
 * viewed day, no toggle) and a collapsed-by-default "History" section
 * (`NoteButtonPill`'s own chevron affordance, reused rather than reinvented —
 * CLAUDE.md's Component Rule) for everything else, always rendered even when
 * empty:
 *   - `quickLogName` button (Vipassana/Exercise/Breathing/Sleep): every
 *     session still IS a real `ScheduledActivity`, fully editable on the
 *     Timeline already, so this is a jump list, not a second edit surface —
 *     each row opens the EXISTING `editActivity`/`LogActivityModal` flow via
 *     `onEditActivity`, then closes this popover. No parallel editor is
 *     built here. "Recent" is `viewedDate`'s own sessions (already in the
 *     `activities` prop); "History" is a real cross-day lookback fetched
 *     lazily, once expanded, via `state/useSessionHistory.ts` (a bounded
 *     window — rule 8 — never the user's full history).
 *   - Day-value button (Steps/Protein): one row per past calendar day, each
 *     inline-editable via the SAME set/replace setter this button's own
 *     editor uses (`state/useDisplayValueHistory.ts`, built on
 *     `lib/displayValuesLocalStore.ts` for Steps and additionally
 *     `public.daily_values` for Protein). "Recent" is the one row (if any)
 *     for `dayKey`; "History" is every other date already loaded by that
 *     same hook.
 */
export function DisplayValueButton({
  buttonKey,
  viewedDate,
  activities,
  onQuickLog,
  onEditActivity,
}: {
  buttonKey: DisplayButtonKey
  viewedDate: Date
  /** Today's board — only read for a `quickLogName` button's computed total/validation, and its own session-history list. */
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
  /** Dispatches `editActivity` — opens the SAME `LogActivityModal` the Timeline's own Edit does, for a `quickLogName` button's session history. Unused for a day-value button. */
  onEditActivity: (id: string) => void
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
  // Rule 9's double-submit guard: `onQuickLog`/`commitLocal` return
  // synchronously (the actual write is dispatched in the background), so
  // nothing else stops a second click landing on this same Save button
  // before the popover has actually closed — unlike `NoteButtonPill`'s Store
  // button, which already has this exact guard via `submitting`. Reset
  // whenever the editor (re)opens, same as every other draft field below.
  const [submitting, setSubmitting] = useState(false)
  // History is collapsed by default, same as `NoteButtonPill` — the popover
  // opens straight to the editor; the day-value/session log is a click away.
  const [historyOpen, setHistoryOpen] = useState(false)
  // Day-value history only: the in-progress edit draft per date, keyed like
  // `SupplementsButton`'s own `noteDrafts` (many independent inline forms,
  // one shared draft map rather than N pieces of state).
  const [historyDrafts, setHistoryDrafts] = useState<Record<string, string>>({})

  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const recentHeadingId = useId()
  const historyHeadingId = useId()
  const historyListId = useId()

  // Day-value history (Steps/Protein) — always called (rules of hooks), a
  // no-op for a `quickLogName` button since nothing ever sets `historyOpen`
  // true for one of those without also never reading `dayValueHistory` below.
  // Fetched as soon as the popover opens (not gated on `historyOpen`) since
  // its OWN "Recent" row (the value for `dayKey`, if any) is always visible.
  const dayValueHistory = useDisplayValueHistory(buttonKey, buttonKey, synced, open && !quickLogName)

  // Cross-day session history (Vipassana/Exercise/Breathing/Sleep) — always
  // called (rules of hooks), a no-op for a day-value button. Unlike
  // `dayValueHistory` above, this one only fetches once `historyOpen` is
  // true: "Recent" for THIS shape is entirely `activities` (already in
  // memory, see `SessionHistory` below), so there is nothing to load until
  // History is actually expanded (rule 8 — a bounded fetch, made lazily).
  const sessionHistory = useSessionHistory(quickLogName ?? '', viewedDate, historyOpen && Boolean(quickLogName))

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
    else {
      setHistoryOpen(false) // Collapsed again next time this popover opens.
      setHistoryDrafts({})
    }
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
    setSubmitting(false)
    // Anchor the popover to whichever edge keeps it fully on screen.
    // Checking only the 'left' fit and falling through to 'right'
    // unconditionally (the original shape here, mirrored from
    // `NoteButtonPill`) could push the panel off the LEFT edge instead when
    // a trigger near the right side of a narrow viewport also fails the
    // 'right' check — confirmed on a 390px mobile viewport. `effectiveWidth`
    // matches the panel's own `calc(100vw-32px)` shrink so this check is
    // accurate on a viewport narrower than `PANEL_WIDTH` itself; when a
    // trigger sits far enough into the middle of a narrow row that NEITHER
    // side fits cleanly, picking whichever spills less keeps the visible
    // clipping to a minimum rather than always favouring one edge.
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const effectiveWidth = Math.min(PANEL_WIDTH, window.innerWidth - 32)
      const fitsLeft = rect.left + effectiveWidth <= window.innerWidth - 16
      const fitsRight = rect.right - effectiveWidth >= 16
      if (fitsLeft) setAlign('left')
      else if (fitsRight) setAlign('right')
      else {
        const leftOverflow = rect.left + effectiveWidth - (window.innerWidth - 16)
        const rightOverflow = 16 - (rect.right - effectiveWidth)
        setAlign(leftOverflow <= rightOverflow ? 'left' : 'right')
      }
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

    // Rule 9: once a submit is already in flight, a second Enter/click on
    // the same form (a fast double-click, or a duplicate submit event) is a
    // no-op rather than a second write — `onQuickLog`/`commitLocal` return
    // synchronously while the actual create/reschedule happens in the
    // background (`state/sync.ts`'s queue), so nothing else in this
    // synchronous handler would otherwise stop a second call slipping
    // through before `setOpen(false)` actually unmounts the form.
    if (submitting) return

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

      setSubmitting(true)
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
      setSubmitting(true)
      commitLocal(durationBetween(start, end))
      return
    }
    setSubmitting(true)
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
            <Button type="submit" size="control" disabled={!canSave || submitting}>
              {submitting ? (
                <>
                  <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </form>

          <div className="mt-lg border-t border-line pt-md">
            {/* Recent — always visible, no toggle/collapse. */}
            <div>
              <h3 id={recentHeadingId} className="text-nano font-semibold uppercase tracking-tag text-ink-dim">
                Recent
              </h3>
              <div aria-labelledby={recentHeadingId} className="mt-sm">
                {quickLogName ? (
                  <SessionHistory
                    activities={activities}
                    quickLogName={quickLogName}
                    onSelect={(id) => {
                      onEditActivity(id)
                      setOpen(false)
                    }}
                  />
                ) : (
                  <DayValueEntryList
                    label={label}
                    entries={dayValueHistory.entries.filter((entry) => entry.date === dayKey)}
                    emptyMessage="No value logged for this day yet."
                    isLoading={dayValueHistory.status === 'loading' && dayValueHistory.entries.length === 0}
                    error={dayValueHistory.error}
                    drafts={historyDrafts}
                    onDraftChange={(date, text) => setHistoryDrafts((prev) => ({ ...prev, [date]: text }))}
                    pendingDate={dayValueHistory.pendingDate}
                    updateEntry={dayValueHistory.updateEntry}
                  />
                )}
              </div>
            </div>

            {/* History — collapsed by default, ALWAYS rendered even when
                empty; scoped to everything other than what Recent already
                shows (no duplication). */}
            <div className="mt-md">
              <button
                type="button"
                id={historyHeadingId}
                aria-expanded={historyOpen}
                aria-controls={historyListId}
                onClick={() => setHistoryOpen((value) => !value)}
                className="flex w-full items-center justify-between text-nano font-semibold uppercase tracking-tag text-ink-dim transition-colors hover:text-ink"
              >
                History
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-[14px] transition-transform', historyOpen && 'rotate-180')}
                />
              </button>

              {historyOpen && (
                <div id={historyListId} role="region" aria-labelledby={historyHeadingId} className="mt-sm">
                  {quickLogName ? (
                    <SessionPastHistory
                      sessionHistory={sessionHistory}
                      onSelect={(id) => {
                        onEditActivity(id)
                        setOpen(false)
                      }}
                    />
                  ) : (
                    <DayValueEntryList
                      label={label}
                      entries={dayValueHistory.entries.filter((entry) => entry.date !== dayKey)}
                      emptyMessage="No other days logged yet."
                      isLoading={dayValueHistory.status === 'loading' && dayValueHistory.entries.length === 0}
                      error={null}
                      drafts={historyDrafts}
                      onDraftChange={(date, text) => setHistoryDrafts((prev) => ({ ...prev, [date]: text }))}
                      pendingDate={dayValueHistory.pendingDate}
                      updateEntry={dayValueHistory.updateEntry}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One session row — shared by `SessionHistory` (today/the viewed day) and
 * `SessionPastHistory` (other days) so neither duplicates this `<li>`
 * (CLAUDE.md's Component Rule). `dateLabel` is only passed by the latter:
 * a Recent row is obviously "the viewed day" already, but a History row can
 * span any of the last `HISTORY_WINDOW_DAYS`, so it needs its own date.
 */
function SessionRow({
  id,
  activity,
  dateLabel,
  onSelect,
}: {
  id: string
  activity: Pick<ScheduledActivity, 'startMinutes' | 'durationMinutes' | 'path'>
  dateLabel?: string
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(id)}
        className="flex w-full flex-col items-start gap-xs rounded-sm bg-bg px-sm py-xs text-left transition-colors hover:bg-line/40"
      >
        <span className="flex w-full items-center justify-between gap-sm">
          <span className="text-caption font-semibold text-ink">
            {dateLabel && <span className="text-ink-dim">{dateLabel} · </span>}
            {formatActivityRange(activity.startMinutes, activity.durationMinutes)}
          </span>
          <span className="text-nano font-semibold text-ink-dim">{formatDuration(activity.durationMinutes)}</span>
        </span>
        {activity.path.length > 0 && <span className="text-nano text-ink-dim">{activity.path.join(' · ')}</span>}
      </button>
    </li>
  )
}

/**
 * A `quickLogName` button's "Recent": a jump list, never a second edit
 * surface (see this file's own doc comment) — every row opens the SAME
 * `LogActivityModal` the Timeline's Edit action already does. Scoped to the
 * viewed day's own sessions, already in memory (the `activities` prop).
 */
function SessionHistory({
  activities,
  quickLogName,
  onSelect,
}: {
  activities: ActivityList
  quickLogName: string
  onSelect: (id: string) => void
}) {
  const sessions = activities
    .filter((activity): activity is ScheduledActivity => activity.name === quickLogName)
    .slice()
    .sort((a, b) => b.startMinutes - a.startMinutes)

  if (sessions.length === 0) {
    return <p className="text-caption text-ink-dim">No sessions logged for this day yet.</p>
  }

  return (
    <ul className="flex max-h-[240px] flex-col gap-sm overflow-y-auto">
      {sessions.map((activity) => (
        <SessionRow key={activity.id} id={activity.id} activity={activity} onSelect={onSelect} />
      ))}
    </ul>
  )
}

/**
 * A `quickLogName` button's "History": the real cross-day lookback fetched
 * by `state/useSessionHistory.ts`, once expanded. `sessionHistory` is passed
 * in rather than called here so the hook itself stays called unconditionally
 * at the top of `DisplayValueButton` (rules of hooks) regardless of which
 * button shape is being rendered.
 */
function SessionPastHistory({
  sessionHistory,
  onSelect,
}: {
  sessionHistory: ReturnType<typeof useSessionHistory>
  onSelect: (id: string) => void
}) {
  const { sessions, status, error } = sessionHistory

  if (status === 'loading' && sessions.length === 0) {
    return (
      <p className="flex items-center gap-sm text-caption text-ink-dim">
        <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
        Loading…
      </p>
    )
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-sm text-caption font-semibold text-ink-dim">
          {error}
        </p>
      )}

      {sessions.length === 0 ? (
        <p className="text-caption text-ink-dim">No earlier sessions yet.</p>
      ) : (
        <ul className="flex max-h-[240px] flex-col gap-sm overflow-y-auto">
          {sessions.map((row) => (
            <SessionRow
              key={row.activity.id}
              id={row.activity.id}
              activity={row.activity}
              dateLabel={formatHistoryDate(row.localDate)}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </>
  )
}

/** `2026-09-05` → `Sat, Sep 5`, device-local, no timezone library needed (mirrors `formatNoteTimestamp`'s date half). */
function formatHistoryDate(iso: string): string {
  return dateFromLocalDateISO(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * A day-value button's (Steps/Protein) Recent OR History list — one row per
 * day in `entries`, each inline-editable via the SAME set/replace setter the
 * editor above uses (`state/useDisplayValueHistory.ts`). The caller
 * (`DisplayValueButton`) passes each of the two sections its own slice of
 * `history.entries` (the `dayKey` row for Recent, every other date for
 * History) and its own `emptyMessage`, so this component itself has no
 * "today" concept of its own — it just renders whatever list it's given.
 */
function DayValueEntryList({
  label,
  entries,
  emptyMessage,
  isLoading,
  error,
  drafts,
  onDraftChange,
  pendingDate,
  updateEntry,
}: {
  label: string
  entries: DisplayValueHistoryEntry[]
  emptyMessage: string
  isLoading: boolean
  error: string | null
  drafts: Record<string, string>
  onDraftChange: (date: string, text: string) => void
  pendingDate: string | null
  updateEntry: UseDisplayValueHistoryResult['updateEntry']
}) {
  if (isLoading) {
    return (
      <p className="flex items-center gap-sm text-caption text-ink-dim">
        <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
        Loading…
      </p>
    )
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-sm text-caption font-semibold text-ink-dim">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-caption text-ink-dim">{emptyMessage}</p>
      ) : (
        <ul className="flex max-h-[240px] flex-col gap-sm overflow-y-auto">
          {entries.map((entry) => {
            const draftText = drafts[entry.date] ?? String(entry.value)
            const parsed = parseDisplayValue(draftText)
            const isPending = pendingDate === entry.date
            const canSaveRow = parsed !== null && parsed !== entry.value && !isPending
            const inputId2 = `display-history-${entry.date}`
            return (
              <li key={entry.date} className="flex items-center justify-between gap-sm rounded-sm bg-bg px-sm py-xs">
                <span className="text-caption font-semibold text-ink-dim">{formatHistoryDate(entry.date)}</span>
                <span className="flex items-center gap-xs">
                  <label htmlFor={inputId2} className="sr-only">
                    {label} on {formatHistoryDate(entry.date)}
                  </label>
                  <input
                    id={inputId2}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draftText}
                    onChange={(event) => onDraftChange(entry.date, event.target.value)}
                    disabled={isPending}
                    className="w-[64px] rounded-md border border-line bg-surface px-sm py-xs text-right text-caption font-semibold text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
                  />
                  <Button
                    type="button"
                    variant="accent"
                    size="inline"
                    disabled={!canSaveRow}
                    onClick={() => {
                      if (parsed !== null) void updateEntry(entry.date, parsed)
                    }}
                  >
                    {isPending ? <Loader2 aria-hidden="true" className="size-[13px] animate-spin" /> : 'Save'}
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
