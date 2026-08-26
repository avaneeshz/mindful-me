import { useEffect } from 'react'
import {
  activitiesTouchingSlot,
  flagMarkerAt,
  formatSlotRange,
  minutesInSlot,
  slotMinuteRange,
  SLOT_MINUTES,
} from '@/domain/slots'
import { isWindowFull, maxContiguousDuration } from '@/domain/scheduling'
import { isStagingComplete, type BoardAction, type BoardState } from '@/state/boardReducer'
import { Button } from '@/components/ui/button'
import { ActivityPicker } from './ActivityPicker'
import { CapacityMeter, type CapacityMeterSegment } from './CapacityMeter'
import { FlagsRow } from './FlagsRow'
import { SlotActivityList } from './SlotActivityList'
import { primaryActionLabel, StagingPane } from './StagingPane'

/** How long the undo affordance stays available after a removal. */
const UNDO_WINDOW_MS = 4000

interface SlotEditorProps {
  state: BoardState
  dispatch: (action: BoardAction) => void
  nowSlot: number
}

/**
 * The dominant surface on the screen, and the ONLY one using elevation-1.
 * Master-detail: the activity picker on the left, a persistent staging pane on
 * the right (stacked below on narrow containers).
 *
 * Commit model is unchanged from the prototype: every Add and Remove commits
 * instantly. There is no batch save, and no confirmation dialog. "Cancel"
 * clears the staged-but-not-yet-added pick only.
 */
export function SlotEditor({ state, dispatch, nowSlot }: SlotEditorProps) {
  const { activities, selectedSlot, staging, removal } = state
  const { start: slotStart } = slotMinuteRange(selectedSlot)
  const touching = activitiesTouchingSlot(activities, selectedSlot)
  const flags = flagMarkerAt(activities, selectedSlot)?.flags ?? []

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

  // Computed ONCE and passed down. The desktop button in StagingPane used to
  // derive its own enabled state from `isStagingComplete(staging)` alone, which
  // could leave it enabled while `commit` clamped the duration to 0 and no-oped.
  const canCommit = isStagingComplete(staging) && maxDuration > 0

  // `ipad-land:p-lg` trims padding exactly as `mobile:p-lg` already does: a
  // vertical density adaptation for a short viewport, not a structural change.
  return (
    <section
      aria-labelledby="slot-editor-heading"
      className="rounded-lg border border-line bg-white p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      <header className="flex flex-wrap items-start justify-between gap-lg">
        <div className="flex flex-col gap-md">
          <div className="flex flex-wrap items-center gap-md">
            <h2
              id="slot-editor-heading"
              className="font-display text-slot-time font-semibold text-forest"
            >
              {formatSlotRange(selectedSlot)}
            </h2>
            <span className="rounded-full border border-forest/20 bg-forest/5 px-sm py-xs text-micro font-bold text-forest">
              Selected slot
            </span>
            {isNow && (
              <span className="rounded-full bg-forest/10 px-sm py-xs text-micro font-bold uppercase tracking-tag text-forest">
                Now
              </span>
            )}
          </div>
          <CapacityMeter segments={meterSegments} />
        </div>

        <FlagsRow
          activeFlags={flags}
          onToggle={(flag) => dispatch({ type: 'toggleFlag', flag })}
        />
      </header>

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

      <div className="editor-body mt-2xl ipad-land:mt-md">
        <div className="editor-split">
          <div className="picker-column">
            <ActivityPicker
              staging={staging}
              atCapacity={atCapacity}
              activityCount={touching.length}
              usedMinutes={usedMinutes}
              onPickCard={(cardName) => dispatch({ type: 'pickCard', cardName })}
              onPickOption={(level, value) => dispatch({ type: 'pickOption', level, value })}
              onBack={() => dispatch({ type: 'crumbBack' })}
            />
          </div>

          <StagingPane
            staging={staging}
            maxDuration={maxDuration}
            canCommit={canCommit}
            onStep={(delta) => dispatch({ type: 'stepDuration', delta })}
            onCommit={() => dispatch({ type: 'commit' })}
            onCancel={() => dispatch({ type: 'cancelStaging' })}
          />
        </div>
      </div>

      {/* Mobile only: keeps the primary action reachable without scrolling back. */}
      {staging.cardName && (
        <div className="fixed inset-x-0 bottom-0 z-10 hidden border-t border-line bg-white px-lg pt-md shadow-elevation-1-up safe-bottom mobile:block">
          <div className="mb-sm flex items-center justify-between text-meta font-semibold text-muted">
            <span className="truncate text-charcoal">{staging.cardName}</span>
            <span>{staging.durationMinutes} min</span>
          </div>
          <Button block disabled={!canCommit} onClick={() => dispatch({ type: 'commit' })}>
            {primaryActionLabel(staging)}
          </Button>
        </div>
      )}
    </section>
  )
}
