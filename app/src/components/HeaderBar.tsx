import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Moon, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { chipVariants } from '@/components/ui/chip'
import { DatePicker } from '@/components/DatePicker'
import { DayOffControl } from '@/components/DayOffControl'
import { NoteButtonPill } from '@/components/NoteButtonPill'
import { DisplayValueButton } from '@/components/DisplayValueButton'
import { ChecklistButton } from '@/components/ChecklistButton'
import { DownloadDayButton } from '@/components/DownloadDayButton'
import { CounclMark, CounclTitle } from '@/components/CounclBrand'
import { WeatherPill } from '@/components/WeatherPill'
import { SyncStatusPill } from '@/components/SyncStatusPill'
import {
  AddCategoryControl,
  AddHeaderButtonChip,
  CategoryHeading,
  EditModeControls,
  EditModeToggle,
  HeaderButtonFormDialog,
} from '@/components/HeaderButtonEditor'
import { setNoteButtonsRegistry, setNoteButtonTypesRegistry } from '@/domain/notes'
import { setDisplayButtonsRegistry } from '@/domain/displayButtons'
import {
  groupHeaderButtons,
  layoutAfterMove,
  layoutFromRows,
  toDisplayButtonLike,
  type HeaderButtonCategory,
  type HeaderButtonConfig,
  type HeaderButtonGroup,
  type HeaderButtonLayout,
} from '@/domain/headerButtons'
import { usePointerReorder, type DragGhost } from '@/components/ui/usePointerReorder'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EditSectionLabel } from '@/components/ui/EditSectionLabel'
import { EditLock } from '@/components/ui/EditLock'
import type { UpdateHeaderButtonInput } from '@/api/headerButtons'
import type { NewHeaderButtonInput } from '@/domain/headerButtonForm'
import { useSharedHeaderButtons } from '@/state/HeaderButtonsContext'
import { HiddenInSettingsLink } from '@/components/settings/HiddenItemsPanel'
import type { ActivityList } from '@/domain/types'
import type { QuickLogInput, QuickLogResult } from '@/state/BoardContext'
import type { AuthUser } from '@/state/AuthContext'
import type { SyncQueue } from '@/state/syncQueue'
import { useStepsBackfill } from '@/state/useStepsBackfill'
import { useDayOffs } from '@/state/useDayOffs'
import { isSameLocalDay, localDateISO, logicalToday } from '@/lib/localTime'
import { cn } from '@/lib/utils'
import { useInterfaceMode } from '@/state/InterfaceContext'

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
  onQuickLog: (input: QuickLogInput) => QuickLogResult
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
   * inline tile editor (`EditableTileRow`) when it's on, rather than needing a
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
  const {
    visible,
    hidden,
    groups,
    notice,
    addButton,
    updateButton,
    hideButton,
    arrange,
    addGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
  } = useSharedHeaderButtons()
  const [formMode, setFormMode] = useState<null | { kind: 'add'; groupId: string } | { kind: 'edit'; button: HeaderButtonConfig }>(
    null,
  )
  const rows = useMemo(() => groupHeaderButtons(groups, visible), [groups, visible])
  // "Delete" asks first; the button is removed from the header (it can be brought back from Settings → Hidden items).
  const [pendingDelete, setPendingDelete] = useState<HeaderButtonConfig | null>(null)

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

  function openEditForm(button: HeaderButtonConfig) {
    setFormMode({ kind: 'edit', button })
  }

  function handleCreate(input: NewHeaderButtonInput, groupId: string) {
    addButton(input, groupId)
  }

  function handleUpdate(input: UpdateHeaderButtonInput & { category: HeaderButtonCategory }, groupId: string) {
    updateButton(input)
    // The form's Category picker is the tap way to move a button between categories.
    const current = rows.find((row) => row.buttons.some((b) => b.id === input.id))?.group.id
    if (current && current !== groupId) arrange(layoutAfterMove(layoutFromRows(rows), input.id, groupId))
  }

  return (
    <header className="flex flex-col gap-md">
      {/* Row 1 — identity + day context. "COUNCL" (Section E greeting, renamed
          from "30-Minute Slotting", then "Consort", then "Council"; not the sidebar/sign-in brand mark "Ritual
          Board") sits left; the viewed-date navigator, weather, and account
          control sit right. Nothing else shares this line. */}
      <div className="flex min-h-header flex-wrap items-center justify-between gap-lg mobile:gap-md">
        <div className="flex items-center gap-sm mobile:pl-[52px]">
          <CounclMark />
          <h1 className="font-display text-h1 font-semibold text-ink mobile:text-h1-sm">
            <CounclTitle />
          </h1>
        </div>

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
      <EditSectionLabel section="nonNegotiableButtons" editMode={editMode} />
      {/* The user's own categories — each a named row holding any mix of the
          four kinds of button (note, quick activity, daily number,
          checklist). A hairline separates them; an empty category only shows
          while editing. */}
      <HeaderButtonRows
        rows={rows}
        groups={groups}
        editMode={editMode}
        onArrange={arrange}
        onEdit={openEditForm}
        onDelete={setPendingDelete}
        onAddButton={(group) => setFormMode({ kind: 'add', groupId: group.id })}
        onAddGroup={addGroup}
        onRenameGroup={renameGroup}
        onDeleteGroup={deleteGroup}
        onMoveGroup={(group, direction) => {
          const ids = groups.map((g) => g.id)
          const from = ids.indexOf(group.id)
          const to = from + direction
          if (from === -1 || to < 0 || to >= ids.length) return
          ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
          reorderGroups(ids)
        }}
        renderButton={(button) =>
          button.category === 'notes' ? (
            <NoteButtonPill buttonKey={button.key ?? button.id} label={button.label} />
          ) : button.category === 'checklist' ? (
            <ChecklistButton button={button} viewedDate={viewedDate} />
          ) : (
            <DisplayValueButton
              buttonKey={button.id}
              viewedDate={viewedDate}
              activities={activities}
              onQuickLog={onQuickLog}
              onEditActivity={onEditActivity}
            />
          )
        }
      />

      {notice && (
        <p role="status" className="text-caption font-semibold text-ink-dim">
          {notice}
        </p>
      )}

      {editMode && <HiddenInSettingsLink count={hidden.length} noun="button" />}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Are you sure you want to delete this button?"
        description={
          pendingDelete
            ? `“${pendingDelete.label}” will be removed from your header. You can bring it back any time from Settings → Hidden items.`
            : undefined
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) hideButton(pendingDelete.id)
          setPendingDelete(null)
        }}
      />

      {formMode && (
        <HeaderButtonFormDialog
          mode={formMode}
          groups={groups}
          onClose={() => setFormMode(null)}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      )}
    </header>
  )
}

/**
 * The categories and their buttons. Outside Edit mode it just renders them.
 * In Edit mode each button is locked (a tap shows "Finish editing to log"
 * instead of logging) and can be dragged — mouse on PC, finger on iPad — to a
 * new spot, in its own category or any other. The same moves are available by
 * tapping: a button's Edit form has a Category picker, and each category
 * heading has move up / down.
 */
function HeaderButtonRows({
  rows,
  groups,
  editMode,
  onArrange,
  onEdit,
  onDelete,
  onAddButton,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveGroup,
  renderButton,
}: {
  rows: { group: HeaderButtonGroup; buttons: HeaderButtonConfig[] }[]
  groups: HeaderButtonGroup[]
  editMode: boolean
  onArrange: (layout: HeaderButtonLayout) => void
  onEdit: (button: HeaderButtonConfig) => void
  onDelete: (button: HeaderButtonConfig) => void
  onAddButton: (group: HeaderButtonGroup) => void
  onAddGroup: (name: string) => void
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onMoveGroup: (group: HeaderButtonGroup, direction: -1 | 1) => void
  renderButton: (button: HeaderButtonConfig) => ReactNode
}) {
  const idBase = useId()
  const byId = new Map(rows.flatMap((row) => row.buttons).map((b) => [b.id, b]))
  // Tapping a button selects it; tapping more buttons in the SAME category adds
  // them (tap a selected one again to drop it from the selection). Dragging any
  // selected button carries the whole selection, to any category. The selection
  // stays through the drag and after the drop, so it can be found again among
  // dozens, and clears when you press anywhere outside the buttons, press
  // Escape, or leave Edit mode.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const categoryOf = (id: string) => rows.find((row) => row.buttons.some((b) => b.id === id))?.group.id

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      if (current.length === 0) return [id]
      // One category at a time: picking from another category starts a new selection.
      if (categoryOf(current[0]!) !== categoryOf(id)) return [id]
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    })
  }

  const { lanes, draggingId, draggingIds, ghost, itemProps, laneRef } = usePointerReorder({
    lanes: layoutFromRows(rows),
    enabled: editMode,
    selectedIds,
    onCommit: (layout) => {
      onArrange(layout)
      // The drop may have moved it out of view; bring it back into view.
      const id = selectedIdsRef.current[0]
      if (id) {
        requestAnimationFrame(() => {
          document.querySelector(`[data-header-button-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        })
      }
    },
    onTap: toggleSelected,
    onDragStart: (id) => setSelectedIds([id]),
  })

  useEffect(() => {
    if (!editMode) setSelectedIds([])
  }, [editMode])

  const hasSelection = selectedIds.length > 0
  useEffect(() => {
    if (!hasSelection) return
    function onPointerDown(event: PointerEvent) {
      // A press on any button (or its edit / delete controls) is handled by that button itself.
      if ((event.target as Element | null)?.closest('[data-header-button-id]')) return
      setSelectedIds([])
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedIds([])
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [hasSelection])

  return (
    <div className="flex flex-col">
      {rows.map((row, index) => {
        const ids = lanes.find((lane) => lane.groupId === row.group.id)?.buttonIds ?? []
        if (ids.length === 0 && !editMode) return null
        const headingId = `${idBase}-${row.group.id}`
        return (
          <section
            key={row.group.id}
            aria-labelledby={headingId}
            className="flex flex-col gap-sm border-t border-line-soft py-sm first:border-t-0 first:pt-0 last:pb-0"
          >
            <CategoryHeading
              group={row.group}
              groups={groups}
              buttonCount={row.buttons.length}
              index={index}
              count={rows.length}
              editMode={editMode}
              headingId={headingId}
              onRename={(name) => onRenameGroup(row.group.id, name)}
              onMove={(direction) => onMoveGroup(row.group, direction)}
              onDelete={() => onDeleteGroup(row.group.id)}
            />
            <div
              ref={laneRef(row.group.id)}
              role="group"
              aria-labelledby={headingId}
              className={cn('flex flex-wrap items-center gap-sm', editMode && 'min-h-[40px]')}
            >
              {ids.map((id) => {
                const button = byId.get(id)
                if (!button) return null
                if (!editMode) {
                  return (
                    <span key={id} className="relative">
                      {renderButton(button)}
                    </span>
                  )
                }
                const props = itemProps(id)
                const selected = selectedIds.includes(id)
                // While several travel together their own slots are placeholders showing where they'll land.
                const inGroupDrag = draggingIds.length > 1 && draggingIds.includes(id)
                return (
                  <span
                    key={id}
                    ref={props.ref}
                    onPointerDown={props.onPointerDown}
                    style={props.style}
                    data-dragging={props['data-dragging']}
                    data-header-button-id={id}
                    data-selected={selected ? '' : undefined}
                    aria-roledescription="draggable button"
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'relative select-none rounded-full transition-opacity duration-200',
                      // While something is selected the rest fade back, so the selection is the only thing at full strength.
                      hasSelection && !selected && 'opacity-40',
                      selected && 'shadow-elevation-2',
                      inGroupDrag && 'opacity-40',
                      draggingId === id && 'shadow-elevation-2',
                    )}
                  >
                    {/* The wobble sits on this inner span, not the draggable one, so it
                        never fights the drag's own transform. Only selected buttons wobble,
                        and they hold still while being dragged. */}
                    <span
                      inert
                      className={cn(
                        'pointer-events-none block rounded-full transition-transform duration-200',
                        inGroupDrag && 'scale-95',
                        selected && draggingIds.length === 0 && 'animate-jiggle',
                        // A selected button is the theme's solid "invert" pair (the same fill as the Done pill).
                        selected && '[&_*]:!text-inv-ink [&_button]:!border-inv-bg [&_button]:!bg-inv-bg',
                      )}
                      style={{ animationDelay: `${-(index % 4) * 0.07 - (ids.indexOf(id) % 3) * 0.05}s` }}
                    >
                      {renderButton(button)}
                    </span>
                    <span data-reorder-ignore="">
                      <EditModeControls button={button} onEdit={() => onEdit(button)} onDelete={() => onDelete(button)} />
                    </span>
                  </span>
                )
              })}
              {editMode && (
                <span data-reorder-ignore="">
                  <AddHeaderButtonChip onClick={() => onAddButton(row.group)} />
                </span>
              )}
            </div>
          </section>
        )
      })}
      {editMode && (
        <div className="pt-sm" data-reorder-ignore="">
          <AddCategoryControl groups={groups} onAdd={onAddGroup} />
        </div>
      )}
      {ghost && typeof document !== 'undefined' && createPortal(<DragStack ghost={ghost} label={byId.get(ghost.primaryId)?.label ?? ''} />, document.body)}
    </div>
  )
}

/**
 * What follows the pointer while several buttons travel together: the pressed
 * button's own label on top, two layers fanned out behind it, and a count.
 * Purely visual — the buttons' real slots (shown faded) are where they'll land.
 */
function DragStack({ ghost, label }: { ghost: DragGhost; label: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[60]"
      style={{ transform: `translate3d(${ghost.x - ghost.grabX}px, ${ghost.y - ghost.grabY}px, 0)` }}
    >
      <div className="relative">
        {ghost.ids.length > 2 && (
          <span className="absolute inset-0 translate-x-[12px] translate-y-[12px] animate-stack-fan rounded-full border border-inv-bg bg-inv-bg/60" />
        )}
        <span className="absolute inset-0 translate-x-[6px] translate-y-[6px] animate-stack-fan rounded-full border border-inv-bg bg-inv-bg/80" />
        <span className="relative flex animate-stack-pop items-center whitespace-nowrap rounded-full border border-inv-bg bg-inv-bg px-md py-[7px] text-body font-semibold text-inv-ink shadow-elevation-2">
          {label}
          <span className="absolute -right-[8px] -top-[8px] flex size-[22px] items-center justify-center rounded-full border-2 border-bg bg-surface text-nano font-bold text-ink shadow-elevation-1">
            {ghost.ids.length}
          </span>
        </span>
      </div>
    </div>
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
  // The month the picker shows — the only window of day-off marks loaded (rule 8).
  const [pickerMonth, setPickerMonth] = useState(viewedDate)
  const { dayOffs, setDayOff, clearDayOff, pendingDate, error: dayOffError } = useDayOffs(open ? pickerMonth : viewedDate)
  const viewedIso = localDateISO(viewedDate)
  const viewedDayOff = dayOffs[viewedIso] ?? null
  const dayOffDates = useMemo(() => new Set(Object.keys(dayOffs)), [dayOffs])
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
        aria-label={`Change viewed date — currently ${formatDatePill(viewedDate)}${viewedDayOff ? ', day off' : ''}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
      >
        <CalendarDays aria-hidden="true" className="size-[14px] text-ink-dim" />
        <time dateTime={machineDate(viewedDate)}>{formatDatePill(viewedDate)}</time>
        {viewedDayOff && (
          <span className="flex items-center gap-xs border-l border-line pl-sm text-ink-dim">
            <Moon aria-hidden="true" className="size-[12px]" />
            Day off
          </span>
        )}
      </button>

      {open && (
        <DatePicker
          viewedDate={viewedDate}
          today={logicalToday(now)}
          onSelect={selectDate}
          onClose={close}
          dayOffDates={dayOffDates}
          onVisibleMonthChange={setPickerMonth}
          footer={
            // Marking a day off is an entry, so it's locked in Edit mode (#17).
            <EditLock>
            <DayOffControl
              dayLabel={isSameLocalDay(viewedDate, logicalToday(now)) ? 'today' : formatDatePill(viewedDate)}
              dayOff={viewedDayOff}
              pending={pendingDate === viewedIso}
              error={dayOffError}
              onMark={() => void setDayOff(viewedIso, null)}
              onClear={() => void clearDayOff(viewedIso)}
              onSaveReason={(reason) => void setDayOff(viewedIso, reason)}
            />
            </EditLock>
          }
        />
      )}
    </div>
  )
}

function AccountMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const { setMode } = useInterfaceMode()
  const navigate = useNavigate()
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
              navigate('/settings')
            }}
            className="w-full rounded-sm px-md py-sm text-left text-body font-semibold text-ink transition-colors hover:bg-bg"
          >
            Settings
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setMode('lumen')
            }}
            className="w-full rounded-sm px-md py-sm text-left text-body font-semibold text-ink transition-colors hover:bg-bg"
          >
            Switch to Lumen
          </button>
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
