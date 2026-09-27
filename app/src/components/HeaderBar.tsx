import { useEffect, useRef, useState } from 'react'
import { CalendarDays, User } from 'lucide-react'
import { chipVariants } from '@/components/ui/chip'
import { DatePicker } from '@/components/DatePicker'
import { NoteButtonPill } from '@/components/NoteButtonPill'
import { DisplayValueButton } from '@/components/DisplayValueButton'
import { ChecklistButton } from '@/components/ChecklistButton'
import { DownloadDayButton } from '@/components/DownloadDayButton'
import { WeatherPill } from '@/components/WeatherPill'
import { SyncStatusPill } from '@/components/SyncStatusPill'
import {
  AddHeaderButtonChip,
  EditModeControls,
  EditModeToggle,
  HeaderButtonFormDialog,
  HiddenButtonsPanel,
} from '@/components/HeaderButtonEditor'
import { setNoteButtonsRegistry, setNoteButtonTypesRegistry } from '@/domain/notes'
import { setDisplayButtonsRegistry } from '@/domain/displayButtons'
import { toDisplayButtonLike, type HeaderButtonCategory, type HeaderButtonConfig } from '@/domain/headerButtons'
import type { CreateHeaderButtonInput, UpdateHeaderButtonInput } from '@/api/headerButtons'
import { useHeaderButtons } from '@/state/useHeaderButtons'
import type { ActivityList, FieldSelections } from '@/domain/types'
import type { AuthUser } from '@/state/AuthContext'
import type { SyncQueue } from '@/state/syncQueue'
import { useStepsBackfill } from '@/state/useStepsBackfill'
import { cn } from '@/lib/utils'

/**
 * `YYYY-MM-DD` in the DEVICE's timezone, for the <time> element's machine-
 * readable value.
 *
 * `toISOString().slice(0, 10)` was wrong: it is UTC-based, so for every local
 * time before UTC midnight in an ahead-of-UTC zone (the client is in IST,
 * UTC+5:30 — so roughly 00:00–05:29 daily) the attribute named YESTERDAY while
 * the visible label correctly named today.
 */
function machineDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDatePill(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export interface HeaderBarProps {
  /** Real device time — the date picker's own "today" reference, never fixed. */
  now: Date
  /** The calendar day the board is currently showing (BL-2). */
  viewedDate: Date
  /** Switches the board to a different day. */
  onSelectDate: (date: Date) => void
  /** The signed-in user, or `null` in local-only mode (no backend configured). */
  user: AuthUser | null
  onSignOut: () => void
  /**
   * The viewed day's board — read by the Vipassana display button for its
   * computed total and to validate a new entry, and by `DownloadDayButton`
   * as the activity source for that day's PDF export.
   */
  activities: ActivityList
  /** Dispatches `quickLogActivity` — see `state/boardReducer.ts`. */
  onQuickLog: (
    cardName: string,
    startMinutes: number,
    durationMinutes: number,
    extra?: {
      path?: string[]
      notes?: string | null
      fieldSelections?: FieldSelections
      dreamsNote?: string | null
    },
  ) => void
  /** Bug B/C — the durable background-sync retry queue; see `SyncStatusPill`. */
  syncQueue: SyncQueue
  /** Wakes the sync queue immediately — the indicator's "Retry now" action. */
  onRetrySyncNow: () => void
  /** Dispatches `editActivity` — a `DisplayValueButton`'s session-history row opens the same `LogActivityModal` edit flow the Timeline itself uses. */
  onEditActivity: (id: string) => void
  /**
   * The ONE edit-mode toggle for the whole day screen — owned by `TodayPage`
   * (not local to this component any more) so `SlotEditor` can read the
   * exact same flag and reveal its own inline tile/activity management
   * panel (`ActivityLibraryPanel`) when it's on, rather than needing a
   * second, disconnected entry point (real user feedback: the separate
   * Activity Library page, reachable only from the sidebar, was never found
   * — see `SlotEditor.tsx`'s own doc comment).
   */
  editMode: boolean
  onToggleEditMode: () => void
}

export function HeaderBar({
  now,
  viewedDate,
  onSelectDate,
  user,
  onSignOut,
  activities,
  onQuickLog,
  syncQueue,
  onRetrySyncNow,
  onEditActivity,
  editMode,
  onToggleEditMode,
}: HeaderBarProps) {
  // One-time upload of any pre-migration Steps data still sitting only in
  // this browser's localStorage — see `state/useStepsBackfill.ts`. A no-op
  // once that's done (or if there was never anything local to begin with).
  useStepsBackfill()

  // The full customization system (HEADER-CUSTOM-1) — every button this
  // user has, local-first with a background sync; a brand-new user is
  // provisioned their own copy of the default set on first load (see
  // `state/useHeaderButtons.ts`). Row 2 below renders straight off
  // `visible`, grouped by category, instead of the three previously-
  // separate hardcoded arrays.
  const { visible, hidden, addButton, updateButton, hideButton, unhideButton } = useHeaderButtons()
  const [formMode, setFormMode] = useState<null | { kind: 'add' } | { kind: 'edit'; button: HeaderButtonConfig }>(
    null,
  )

  // `DisplayValueButton`/`NoteButtonPill` stay keyed by a plain string prop
  // (unchanged internals — see the full-stack-engineer report for why) and
  // read their per-button config through a small runtime registry rather
  // than threading a config object through every call site. Set on every
  // render (not in a `useEffect`) so a child never renders one frame behind
  // on stale/default config — see `domain/displayButtons.ts`'s own doc
  // comment on `setDisplayButtonsRegistry`.
  const allButtons = [...visible, ...hidden]
  setDisplayButtonsRegistry(
    allButtons.filter((b) => b.category === 'activity' || b.category === 'day_value').map(toDisplayButtonLike),
  )
  const noteButtonConfigs = allButtons.filter((b) => b.category === 'notes')
  setNoteButtonsRegistry(noteButtonConfigs.map((b) => ({ key: b.key ?? b.id, label: b.label })))
  setNoteButtonTypesRegistry(Object.fromEntries(noteButtonConfigs.map((b) => [b.key ?? b.id, b.noteTypes])))

  const visibleNoteButtons = visible.filter((b) => b.category === 'notes')
  const visibleQuickLogButtons = visible.filter((b) => b.category === 'activity' || b.category === 'day_value')
  const visibleChecklistButtons = visible.filter((b) => b.category === 'checklist')

  function openEditForm(button: HeaderButtonConfig) {
    setFormMode({ kind: 'edit', button })
  }

  function handleCreate(input: Omit<CreateHeaderButtonInput, 'id'>) {
    addButton(input)
  }

  function handleUpdate(input: UpdateHeaderButtonInput & { category: HeaderButtonCategory }) {
    updateButton(input)
  }

  return (
    <header className="flex flex-col gap-md">
      {/* Row 1 — identity + day context. "Consort" (Section E greeting, renamed
          from "30-Minute Slotting"; not the sidebar/sign-in brand mark "Ritual
          Board") sits left; the viewed-date navigator, weather, and account
          control sit right. Nothing else shares this line. */}
      <div className="flex min-h-header flex-wrap items-center justify-between gap-lg mobile:gap-md">
        <h1 className="pl-0 font-display text-h1 font-semibold text-ink mobile:pl-[52px] mobile:text-h1-sm">
          Consort
        </h1>

        <div className="flex flex-wrap items-center justify-end gap-sm">
          {/*
            The date pill is a real navigation control now (BL-2), not display-
            only text, so — unlike the weather pill beside it — it stays visible
            on mobile too: it is the only way a phone-width viewport can view a
            day other than today. Weather remains the phone-only simplification
            the original comment described (secondary context, not something a
            narrow header has room to keep alongside the title and the account
            control).
          */}
          <DatePill now={now} viewedDate={viewedDate} onSelectDate={onSelectDate} />

          <DownloadDayButton viewedDate={viewedDate} activities={activities} />

          <SyncStatusPill queue={syncQueue} onRetryNow={onRetrySyncNow} />

          <EditModeToggle active={editMode} onToggle={onToggleEditMode} />

          <WeatherPill className="mobile:hidden" />

          {user ? (
            <AccountMenu user={user} onSignOut={onSignOut} />
          ) : (
            // No real session (local-only mode) — same non-interactive treatment
            // as before: there is no account menu behind it, so it carries no
            // hover or focus state and is not focusable. No colour any more
            // (Section A) — the theme's own invert pair, same as everywhere
            // else a "primary" mark shows up.
            <div
              className="flex size-avatar cursor-default items-center justify-center rounded-full bg-inv-bg"
              aria-hidden="true"
            >
              <User className="size-[16px] text-inv-ink" />
            </div>
          )}
        </div>
      </div>

      {/* Row 2 — the day's entry controls, on their own wrapping line beneath
          the header so they read as one group, left-aligned and consistently
          spaced rather than crammed against the title. Note pills first —
          Extra Senses (was Gifts), Learnings, People (was Mirror), Scriptures;
          each opens a note-entry popover (see `NoteButtonPill`), Chits and
          Opportunities moved to the sidebar — then the display buttons
          (Vipassana/Exercise/Breathing/Sleep/Prayer/Sermons/Worship minutes,
          Steps/Protein counts), which always show a stored per-day number
          (computed, for the quick-log ones) and log/set it on click. Prayer,
          Sermons and Worship moved here from the note-pill row — see
          `domain/notes.ts`'s own doc comment. */}
      <div className="flex flex-wrap items-center gap-sm">
        {visibleNoteButtons.map((button) => (
          <span key={button.id} className="relative">
            <NoteButtonPill buttonKey={button.key ?? button.id} label={button.label} />
            {editMode && (
              <EditModeControls button={button} onEdit={() => openEditForm(button)} onHide={() => hideButton(button.id)} />
            )}
          </span>
        ))}

        {visibleQuickLogButtons.map((button) => (
          <span key={button.id} className="relative">
            <DisplayValueButton
              buttonKey={button.id}
              viewedDate={viewedDate}
              activities={activities}
              onQuickLog={onQuickLog}
              onEditActivity={onEditActivity}
            />
            {editMode && (
              <EditModeControls button={button} onEdit={() => openEditForm(button)} onHide={() => hideButton(button.id)} />
            )}
          </span>
        ))}

        {visibleChecklistButtons.map((button) => (
          <span key={button.id} className="relative">
            <ChecklistButton button={button} viewedDate={viewedDate} />
            {editMode && (
              <EditModeControls button={button} onEdit={() => openEditForm(button)} onHide={() => hideButton(button.id)} />
            )}
          </span>
        ))}

        {editMode && <AddHeaderButtonChip onClick={() => setFormMode({ kind: 'add' })} />}
      </div>

      {editMode && <HiddenButtonsPanel hidden={hidden} onUnhide={unhideButton} />}

      {formMode && (
        <HeaderButtonFormDialog
          mode={formMode}
          onClose={() => setFormMode(null)}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      )}
    </header>
  )
}

function DatePill({
  now,
  viewedDate,
  onSelectDate,
}: {
  now: Date
  viewedDate: Date
  onSelectDate: (date: Date) => void
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

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

  function selectDate(date: Date) {
    onSelectDate(date)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Change viewed date — currently ${formatDatePill(viewedDate)}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
      >
        <CalendarDays aria-hidden="true" className="size-[14px] text-ink-dim" />
        <time dateTime={machineDate(viewedDate)}>{formatDatePill(viewedDate)}</time>
      </button>

      {open && <DatePicker viewedDate={viewedDate} today={now} onSelect={selectDate} onClose={close} />}
    </div>
  )
}

function AccountMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

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

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user.email ? `Account menu — signed in as ${user.email}` : 'Account menu'}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex size-avatar items-center justify-center rounded-full bg-inv-bg',
          'transition-[filter] hover:brightness-105 active:brightness-95',
        )}
      >
        <User aria-hidden="true" className="size-[16px] text-inv-ink" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[220px] rounded-md border border-line bg-surface p-xs shadow-elevation-2"
        >
          {user.email && (
            <div className="truncate px-md py-sm text-caption text-ink-dim" title={user.email}>
              {user.email}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="w-full rounded-sm px-md py-sm text-left text-body font-semibold text-ink transition-colors hover:bg-bg"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
