import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import {
  activitiesTouchingSlot,
  flagMarkerAt,
  formatActivityRange,
  formatSlotRange,
  minutesInSlot,
  slotMinuteRange,
  SLOT_MINUTES,
} from '@/domain/slots'
import { isWindowFull, maxContiguousDuration } from '@/domain/scheduling'
import { isStagingComplete, type BoardAction, type BoardState } from '@/state/boardReducer'
import { useDismissedActivities } from '@/state/dismissedActivities'
import { Chip } from '@/components/ui/chip'
import { ActivitySummary } from './ActivitySummary'
import { CapacityMeter, type CapacityMeterSegment } from './CapacityMeter'
import { LogActivityModal } from './LogActivityModal'
import { SlotActivityList } from './SlotActivityList'
import { describeSlotContents, TileRow } from './TileRow'

/** Which of the two panel views is showing — plain ephemeral UI state, not board data (same reasoning `ThemeContext` is kept separate from `BoardContext`). */
type PanelView = 'slot' | 'activity'

/** How long the undo affordance stays available after a removal. */
const UNDO_WINDOW_MS = 4000

interface SlotEditorProps {
  state: BoardState
  dispatch: (action: BoardAction) => void
  nowSlot: number
  /**
   * The calendar day currently being viewed — keys the manual "mark done"
   * state (Tile Redesign §5), which is scoped per day and reset at local
   * midnight (`state/dismissedActivities.ts`). Deliberately required, not a
   * `new Date()`-on-every-render default: that would hand
   * `useDismissedActivities` a new object identity on every re-render and
   * re-trigger its load effect continuously.
   */
  viewedDate: Date
}

/**
 * The dominant surface on the screen, and the ONLY one using elevation-1.
 * The tile row + its expand panel sit inline here; everything else about
 * placing/logging an activity — duration, "how did it feel", flag — happens
 * in `LogActivityModal`, a floating overlay, not a persistent side column
 * (Modal Redesign §1/§B — `StagingPane` and the old side-by-side split are
 * retired; the header's whole-slot `FlagsRow` is retired too, since flags
 * now attach to the specific activity being logged, not the slot — see
 * `LogActivityModal`'s `FlagPicker`. `flagMarkerAt`/legacy marker rendering
 * on the timeline strip is untouched — read-compat for any pre-existing
 * marker rows, just nothing creates new ones any more.).
 *
 * Commit model is unchanged from the prototype: every Save and Remove
 * commits instantly. There is no batch save. "Cancel" clears the
 * staged-but-not-yet-saved pick only.
 */
export function SlotEditor({ state, dispatch, nowSlot, viewedDate }: SlotEditorProps) {
  const { activities, selectedSlot, staging, removal, viewingActivityId } = state
  // Ephemeral UI state — which of the two panel views is showing. Doesn't
  // need to survive a reload and doesn't belong in the reducer, the same
  // reasoning `ThemeContext` is kept separate from `BoardContext`.
  const [view, setView] = useState<PanelView>('slot')
  const { start: slotStart } = slotMinuteRange(selectedSlot)
  const touching = activitiesTouchingSlot(activities, selectedSlot)
  const flags = flagMarkerAt(activities, selectedSlot)?.flags ?? []
  const { dismissed, toggleDismissed } = useDismissedActivities(viewedDate)

  // The toggle only matters once there is something an Activity view could
  // possibly show — a totally empty slot renders Slot view directly, with no
  // toggle at all (Panel Redesign §1).
  const hasTouchingActivities = touching.length > 0

  // Auto-reset to Slot view whenever nothing specific is being viewed
  // (Panel Redesign §2) — `viewingActivityId` already goes `null` on a plain
  // `selectSlot` dispatch and when `removeActivity` clears a viewed-then-
  // deleted activity, so deriving the rendered view straight from it (rather
  // than reading the manually-set `view` state alone) is what makes those
  // cases snap back to Slot on their own. The asymmetry is deliberate: once
  // `selectActivity` sets a real `viewingActivityId`, this defers entirely to
  // whatever `view` the user last chose.
  const effectiveView: PanelView = viewingActivityId ? view : 'slot'

  // Guards against `undefined` itself — a since-removed or never-set id.
  const viewingActivity = viewingActivityId
    ? activities.find((a) => a.id === viewingActivityId)
    : undefined
  const headingLabel =
    effectiveView === 'activity' && viewingActivity
      ? formatActivityRange(viewingActivity.startMinutes, viewingActivity.durationMinutes)
      : formatSlotRange(selectedSlot)

  const usedMinutes = touching.reduce((sum, a) => sum + minutesInSlot(a, selectedSlot), 0)
  const meterSegments: CapacityMeterSegment[] = touching
    .slice()
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .map((a) => ({ id: a.id, minutes: minutesInSlot(a, selectedSlot) }))

  const maxDuration = staging.cardName
    ? maxContiguousDuration(activities, staging.startMinutes, staging.editingId)
    : 0
  // A slot reads as "full" once nothing new could start anywhere within it —
  // never while merely configuring something already staged for it.
  const atCapacity = isWindowFull(activities, slotStart, SLOT_MINUTES) && staging.cardName === null
  const isNow = selectedSlot === nowSlot

  // The undo affordance expires on its own; nothing else clears it.
  useEffect(() => {
    if (!removal) return
    const id = window.setTimeout(
      () => dispatch({ type: 'dismissRemoval', id: removal.activity.id }),
      UNDO_WINDOW_MS,
    )
    return () => window.clearTimeout(id)
  }, [removal, dispatch])

  // Computed ONCE and passed to the modal. Used to derive its own enabled
  // state from `isStagingComplete(staging)` alone, which could leave it
  // enabled while `commit` clamped the duration to 0 and no-oped.
  const canCommit = isStagingComplete(staging) && maxDuration > 0

  // `ipad-land:p-lg` trims padding exactly as `mobile:p-lg` already does: a
  // vertical density adaptation for a short viewport, not a structural change.
  return (
    <section
      aria-labelledby="slot-editor-heading"
      className="rounded-lg border border-line bg-surface p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      <header className="flex flex-wrap items-start justify-between gap-lg">
        <div className="flex flex-col gap-md">
          <div className="flex flex-wrap items-center gap-md">
            <h2
              id="slot-editor-heading"
              className="font-display text-slot-time font-semibold text-ink"
            >
              {headingLabel}
            </h2>
            <span className="rounded-full border border-line bg-bg px-sm py-xs text-micro font-bold text-ink">
              Selected slot
            </span>
            {isNow && (
              <span className="rounded-full bg-ink/10 px-sm py-xs text-micro font-bold uppercase tracking-tag text-ink">
                Now
              </span>
            )}
            {/* Legacy whole-slot flag markers (pre-existing data only —
                nothing creates these any more) still surface here, read-only.
                No separate colour any more (Section A) — distinguished from
                the other pills by content alone, same monochrome treatment. */}
            {flags.length > 0 && (
              <span className="rounded-full bg-ink/10 px-sm py-xs text-micro font-bold text-ink">
                {flags.join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Activity | Slot — extends the Chip primitive's own `size="segment"`
            variant, built for exactly this two-option segmented shape (see
            `components/ui/chip.tsx`). Plain ephemeral view state, same
            single-select radiogroup pattern `FlagPicker` already establishes.
            Hidden entirely on a totally empty slot (Panel Redesign §1) —
            Activity view there could only ever show its own empty state. */}
        {hasTouchingActivities && (
          <div
            role="radiogroup"
            aria-label="Panel view"
            className="flex items-center gap-xs rounded-full bg-bg p-xs"
          >
            <Chip
              as="button"
              size="segment"
              tone={effectiveView === 'activity' ? 'active' : 'bare'}
              interactive
              role="radio"
              aria-checked={effectiveView === 'activity'}
              onClick={() => setView('activity')}
            >
              Activity
            </Chip>
            <Chip
              as="button"
              size="segment"
              tone={effectiveView === 'slot' ? 'active' : 'bare'}
              interactive
              role="radio"
              aria-checked={effectiveView === 'slot'}
              onClick={() => setView('slot')}
            >
              Slot
            </Chip>
          </div>
        )}
      </header>

      {/* The shared min-height keeps the toggle from visibly resizing the
          frame — re-measured for the leaner Slot/Activity content Panel
          Redesign §§1-4 leave behind (a full `TileRow` grid no longer shares
          this space at all — see the `atCapacity` branch below — and
          `ActivitySummary` no longer stacks everything in one long column).
          `ActivitySummary` fills the same space (`flex-1` + its own
          `justify-center`) rather than leaving a short card with a lot of
          empty gap below it. */}
      <div className="mt-2xl flex min-h-[220px] flex-col mobile:min-h-[180px] ipad-land:mt-md ipad-land:min-h-[160px]">
        {effectiveView === 'slot' ? (
          <>
            <CapacityMeter segments={meterSegments} />

            <SlotActivityList
              touching={touching}
              selectedSlot={selectedSlot}
              removal={removal}
              editingId={staging.editingId}
              onEdit={(id) => dispatch({ type: 'editActivity', id })}
              onRemove={(id) => dispatch({ type: 'removeActivity', id })}
              onToggleComplete={(id) => dispatch({ type: 'toggleComplete', id })}
              onUndo={() => dispatch({ type: 'undoRemoval' })}
            />

            {/* Panel Redesign §3 — a fully-booked slot has nothing left to
                pick, so the 9-tile picker doesn't mount at all here any more
                (previously always rendered, just dimmed). A one-line status
                note takes its place; `SlotActivityList` above is unaffected —
                the existing-activity list is exactly what stays useful here. */}
            {atCapacity ? (
              <p
                role="status"
                className="mt-2xl flex items-start gap-sm rounded-md bg-bg px-md py-sm text-note font-medium text-ink ipad-land:mt-md"
              >
                <Info aria-hidden="true" className="mt-px size-[14px] shrink-0 text-ink-dim" />
                <span>
                  This slot is full — {describeSlotContents(touching.length, usedMinutes)}.{' '}
                  {touching.length === 1 ? 'Remove it' : 'Remove one'} above to free up space, or
                  choose a different slot.
                </span>
              </p>
            ) : (
              <div className="mt-2xl ipad-land:mt-md">
                <TileRow
                  activities={activities}
                  dismissed={dismissed}
                  onPickCard={(cardName) => dispatch({ type: 'pickCard', cardName })}
                  onToggleDismiss={toggleDismissed}
                />
              </div>
            )}
          </>
        ) : (
          <ActivitySummary
            activity={viewingActivity}
            onEdit={(id) => dispatch({ type: 'editActivity', id })}
          />
        )}
      </div>

      <LogActivityModal
        staging={staging}
        activities={activities}
        maxDuration={maxDuration}
        canCommit={canCommit}
        onPickOption={(level, value) => dispatch({ type: 'pickOption', level, value })}
        onStep={(delta) => dispatch({ type: 'stepDuration', delta })}
        onSetDuration={(minutes) => dispatch({ type: 'setDuration', minutes })}
        onMove={(minutes) => dispatch({ type: 'setStagingStart', minutes })}
        onResizeStart={(minutes) => dispatch({ type: 'resizeStagingStart', minutes })}
        onSetFlag={(flag) => dispatch({ type: 'setStagingFlag', flag })}
        onToggleQuality={(quality) => dispatch({ type: 'toggleStagingQuality', quality })}
        onToggleSymptom={(symptom) => dispatch({ type: 'toggleStagingSymptom', symptom })}
        onSetNotes={(notes) => dispatch({ type: 'setStagingNotes', notes })}
        onCommit={() => dispatch({ type: 'commit' })}
        onCancel={() => dispatch({ type: 'cancelStaging' })}
      />
    </section>
  )
}
