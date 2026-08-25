import { useEffect } from 'react'
import {
  entryAt,
  formatSlotRange,
  isSlotFullAt,
  maxScheduleDuration,
  spilloverActivity,
  usedMinutes,
} from '@/domain/slots'
import { isStagingComplete, type BoardAction, type BoardState } from '@/state/boardReducer'
import { Button } from '@/components/ui/button'
import { ActivityPicker } from './ActivityPicker'
import { CapacityMeter } from './CapacityMeter'
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
  const { entries, selectedSlot, staging, removal } = state
  const entry = entryAt(entries, selectedSlot)
  // The portion (if any) of an earlier anchor's longer activity spilling
  // into THIS slot. There is only ever one copy of that activity — it stays
  // at its own anchor — this is a read-only view for the meter and the "In
  // this slot" list; see `spilloverActivity`.
  const spillover = spilloverActivity(entries, selectedSlot)

  const used = usedMinutes(entry)
  // The slot a staged edit actually applies to. Normally `selectedSlot`
  // itself (adding new, or editing one of ITS own rows) — but editing a
  // spillover row's activity in place (see `onEditSpillover` below) targets
  // that activity's real anchor without moving `selectedSlot` there, so the
  // stepper's ceiling has to be computed against the real anchor too.
  const editSlot = staging.editingSlot ?? selectedSlot
  const maxDuration = maxScheduleDuration(entries, editSlot, staging.editingIndex)
  // Spillover-aware: a slot only reads as "full" once its own capacity, net
  // of any earlier anchor's activity spilling into it, is actually exhausted.
  const atCapacity = isSlotFullAt(entries, selectedSlot) && staging.cardName === null
  const isNow = selectedSlot === nowSlot
  // Which row (if any) currently on screen is the one loaded into the
  // stepper below — a NATIVE row only when the edit target IS this slot, the
  // spillover row when it's the activity spilling in from an earlier anchor.
  const editingNativeIndex = staging.editingSlot === selectedSlot ? staging.editingIndex : null
  const spilloverIsEditing =
    spillover !== null &&
    staging.editingSlot === spillover.anchorSlot &&
    staging.editingIndex === spillover.index

  // The undo affordance expires on its own; nothing else clears it.
  useEffect(() => {
    if (!removal) return
    const id = window.setTimeout(
      () => dispatch({ type: 'dismissRemoval', id: removal.id }),
      UNDO_WINDOW_MS,
    )
    return () => window.clearTimeout(id)
  }, [removal, dispatch])

  const slotRemoval = removal && removal.slot === selectedSlot ? removal : null

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
          <CapacityMeter activities={entry.activities} spillover={spillover?.minutesHere ?? 0} />
        </div>

        <FlagsRow
          activeFlags={entry.flags}
          onToggle={(flag) => dispatch({ type: 'toggleFlag', flag })}
        />
      </header>

      <SlotActivityList
        activities={entry.activities}
        spillover={spillover}
        spilloverIsEditing={spilloverIsEditing}
        removal={slotRemoval}
        editingIndex={editingNativeIndex}
        onEdit={(index) => dispatch({ type: 'editActivity', index })}
        onRemove={(index) => dispatch({ type: 'removeActivity', index })}
        // Edit on a spillover row loads the one real activity — which lives
        // at its anchor slot — into the SAME stepper below, IN PLACE: it
        // does not move `selectedSlot`, so the user stays looking at the
        // slot they clicked Edit from and sees the result land there once
        // they save (e.g. trimming a 60-minute activity down to 45 frees the
        // tail of THIS slot immediately, no navigation required). Remove is
        // more disruptive — the row here would vanish either way, and the
        // Undo affordance is anchor-scoped — so it still jumps to the anchor
        // the way it already did, where Undo remains reachable.
        onEditSpillover={() => {
          if (!spillover) return
          dispatch({ type: 'editActivity', index: spillover.index, slot: spillover.anchorSlot })
        }}
        onRemoveSpillover={() => {
          if (!spillover) return
          dispatch({ type: 'selectSlot', slot: spillover.anchorSlot })
          dispatch({ type: 'removeActivity', index: spillover.index })
        }}
        onUndo={() => dispatch({ type: 'undoRemoval' })}
      />

      <div className="editor-body mt-2xl ipad-land:mt-md">
        <div className="editor-split">
          <div className="picker-column">
            <ActivityPicker
              staging={staging}
              atCapacity={atCapacity}
              // Includes the spillover row so the "this slot is full" count
              // and total agree with what "In this slot" (and the meter)
              // just showed above — a fully spillover-consumed slot has 0
              // NATIVE activities of its own, but is not describable as "0
              // activities totalling 0 minutes".
              activityCount={entry.activities.length + (spillover ? 1 : 0)}
              usedMinutes={used + (spillover?.minutesHere ?? 0)}
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
            <span>{staging.duration} min</span>
          </div>
          <Button block disabled={!canCommit} onClick={() => dispatch({ type: 'commit' })}>
            {primaryActionLabel(staging)}
          </Button>
        </div>
      )}
    </section>
  )
}
