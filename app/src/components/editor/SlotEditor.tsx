import { useEffect, useRef, useState } from 'react'
import { ActivityLibraryPanel } from '@/components/activityLibrary/ActivityLibraryPanel'
import {
  activitiesTouchingSlot,
  flagMarkerAt,
  formatSlotRange,
  minutesInSlot,
  slotIndexFromMinutes,
  slotMinuteRange,
  SLOT_MINUTES,
} from '@/domain/slots'
import { isWindowFull, maxContiguousDuration } from '@/domain/scheduling'
import { isStagingComplete, type BoardAction, type BoardState } from '@/state/boardReducer'
import { useDismissedActivities } from '@/state/dismissedActivities'
import { activitySyncState, type SyncQueue } from '@/state/syncQueue'
import { catalogIdForName } from '@/api/catalog'
import { useParameterOptions } from '@/state/useParameterOptions'
import { ActivitySummary } from './ActivitySummary'
import { CapacityMeter, type CapacityMeterSegment } from './CapacityMeter'
import { LogActivityModal } from './LogActivityModal'
import { SlotActivityList } from './SlotActivityList'
import { TileRow } from './TileRow'

/**
 * Resolves the staged TOP-LEVEL card's own server `activities.id` (never a
 * sub/third-level path segment — this codebase has no id resolution for
 * those at all today, only for top-level cards; see `api/catalog.ts`'s
 * `catalogIdForName`). Used purely to scope which activity's own
 * quality/symptom/flag option list (PICKER-CUSTOM-1) the modal shows —
 * `null` while unresolved (zero backend configured, not yet loaded, or a
 * name with no catalog entry) falls back to this user's own default list,
 * never blocking the modal on the network (rule 6).
 */
function useStagedActivityId(cardName: string | null): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!cardName) {
      setId(null)
      return
    }
    void catalogIdForName(cardName).then((resolved) => {
      if (!cancelled) setId(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [cardName])
  return id
}

/** How long the undo affordance stays available after a removal. */
const UNDO_WINDOW_MS = 4000

interface SlotEditorProps {
  state: BoardState
  dispatch: (action: BoardAction) => void
  nowSlot: number
  /**
   * Tap a reflection thumbnail in the selected activity's summary — opens
   * that pairing's note-entry popup (owned by `TodayPage`, same as the
   * Reflection-grid tap path).
   */
  onOpenReflectionNote: (card: number) => void
  /**
   * The calendar day currently being viewed — keys the manual "mark done"
   * state (Tile Redesign §5), which is scoped per day and reset at local
   * midnight (`state/dismissedActivities.ts`). Deliberately required, not a
   * `new Date()`-on-every-render default: that would hand
   * `useDismissedActivities` a new object identity on every re-render and
   * re-trigger its load effect continuously.
   */
  viewedDate: Date
  /** Bug B — drives the selected activity's "not yet synced" / "sync failed" badge; see `ActivitySummary`. */
  syncQueue: SyncQueue
  /** The one Edit-mode toggle for the whole screen (owned by `TodayPage`) — this component renders its own inline tile/activity management panel (`ActivityLibraryPanel`, at the section level, not inside `TileRow` — see the render site's own comment for why) while it's on. */
  editMode: boolean
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
export function SlotEditor({ state, dispatch, nowSlot, viewedDate, onOpenReflectionNote, syncQueue, editMode }: SlotEditorProps) {
  const { activities, selectedSlot, staging, removal } = state

  // Lazy-mount-once, then keep alive — `ActivityLibraryPanel` (rendered
  // near the bottom of this component) is genuinely expensive to remount:
  // it owns its own `selectedTileId`/`selectedActivityId` state and fires a
  // `useParameterOptions` fetch. Mounting it unconditionally from the very
  // first render (so a toggle off/on never loses that state — see the
  // render site's own comment) would mean EVERY visit to this screen pays
  // that fetch, even for the vast majority of sessions that never open Edit
  // mode at all. This ref instead remembers only that Edit mode was opened
  // at least once THIS session — before that, the panel is never mounted
  // (zero extra cost); once opened, it mounts and stays mounted (hidden via
  // the `hidden` attribute, not unmounted) for the rest of the session, so
  // switching Edit mode off and back on preserves exactly where the user
  // left off.
  const everOpenedManagementPanelRef = useRef(false)
  if (editMode) everOpenedManagementPanelRef.current = true
  // "Activity mode": an activity was selected on the timeline (or by clicking
  // a fully-covered slot). Its summary REPLACES the whole slot body below —
  // the two are mutually exclusive by construction (`selectSlot` always
  // clears `selectedActivityId`). A stale id (e.g. the activity was just
  // removed and the reducer cleared the selection) resolves to null and
  // falls back to slot mode.
  const selectedActivity = state.selectedActivityId
    ? activities.find((a) => a.id === state.selectedActivityId) ?? null
    : null
  const { start: slotStart } = slotMinuteRange(selectedSlot)
  const touching = activitiesTouchingSlot(activities, selectedSlot)
  const flags = flagMarkerAt(activities, selectedSlot)?.flags ?? []
  const { dismissed, toggleDismissed } = useDismissedActivities(viewedDate)

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

  // PICKER-CUSTOM-1 — the staged activity's own effective quality/symptom/
  // flag option lists. `undefined` (never `[]`) until genuinely `'ready'`,
  // so a brief loading moment falls back to each picker's own static
  // default set instead of flashing zero options.
  //
  // While `editMode` is on AND an activity is staged, `ActivityLibraryPanel`
  // below mounts its OWN separate `useParameterOptions(selectedActivityId)`
  // instance — unlike `tiles`/`activities` (properly shared via
  // `PickerDataContext`), this hook has no single shared instance across the
  // app. Two DIFFERENT concerns were found here in self-review, one fixed,
  // one accepted as-is: (1) a write through the PANEL's instance used to be
  // invisible to THIS instance, so `LogActivityModal`'s pickers could keep
  // offering an option the user had just removed via the panel — fixed by
  // `state/parameterOptionsInvalidation.ts` (see that module's own doc
  // comment): every successful, server-backed edit now notifies every OTHER
  // `useParameterOptions` instance watching the same activity to re-fetch,
  // regardless of which component owns it. (2) When the staged and the
  // panel-selected activity are the same node, each still fires its own
  // independent 4-RPC fetch rather than sharing one — a real, accepted
  // inefficiency (no correctness impact), left as a documented, lower-
  // priority follow-up rather than building a full shared, multi-key cache,
  // which felt like more machinery than this feedback round's scope
  // justified.
  const stagedActivityId = useStagedActivityId(staging.cardName)
  const parameterOptions = useParameterOptions(stagedActivityId)
  const qualityOptions =
    parameterOptions.status === 'ready' ? parameterOptions.effective.quality.map((o) => o.label) : undefined
  const symptomOptions =
    parameterOptions.status === 'ready' ? parameterOptions.effective.symptom.map((o) => o.label) : undefined
  const flagOptions =
    parameterOptions.status === 'ready' ? parameterOptions.effective.flag.map((o) => o.label) : undefined

  // `ipad-land:p-lg` trims padding exactly as `mobile:p-lg` already does: a
  // vertical density adaptation for a short viewport, not a structural change.
  return (
    <>
    <section
      aria-labelledby={selectedActivity ? undefined : 'slot-editor-heading'}
      aria-label={selectedActivity ? 'Selected activity' : undefined}
      className="rounded-lg border border-line bg-surface p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      {selectedActivity ? (
        <ActivitySummary
          activity={selectedActivity}
          onEdit={() => dispatch({ type: 'editActivity', id: selectedActivity.id })}
          onRemove={() => {
            // Drop back into slot mode ON the removed activity's own slot
            // first, so the 4-second undo affordance actually renders in the
            // "In this slot" list (it only shows for the selected slot).
            dispatch({ type: 'selectSlot', slot: slotIndexFromMinutes(selectedActivity.startMinutes) })
            dispatch({ type: 'removeActivity', id: selectedActivity.id })
          }}
          onClose={() => dispatch({ type: 'selectScheduledActivity', id: null })}
          onOpenNote={onOpenReflectionNote}
          syncState={activitySyncState(syncQueue, selectedActivity.id)}
        />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-lg">
            <div className="flex flex-col gap-md">
              <div className="flex flex-wrap items-center gap-md">
                <h2
                  id="slot-editor-heading"
                  className="font-display text-slot-time font-semibold text-ink"
                >
                  {formatSlotRange(selectedSlot)}
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
                    nothing creates these any more) still surface here,
                    read-only. No separate colour any more (Section A) —
                    distinguished from the other pills by content alone, same
                    monochrome treatment. */}
                {flags.length > 0 && (
                  <span className="rounded-full bg-ink/10 px-sm py-xs text-micro font-bold text-ink">
                    {flags.join(', ')}
                  </span>
                )}
              </div>
              <CapacityMeter segments={meterSegments} />
            </div>
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

          <div className="mt-2xl ipad-land:mt-md">
            <TileRow
              atCapacity={atCapacity}
              activityCount={touching.length}
              usedMinutes={usedMinutes}
              activities={activities}
              dismissed={dismissed}
              onPickCard={(cardName) => dispatch({ type: 'pickCard', cardName })}
              onToggleDismiss={toggleDismissed}
            />
          </div>
        </>
      )}

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
        onToggleFieldSelection={(fieldId, value) => dispatch({ type: 'toggleStagingFieldSelection', fieldId, value })}
        onSetDreamsNote={(note) => dispatch({ type: 'setStagingDreamsNote', note })}
        onCommit={() => dispatch({ type: 'commit' })}
        onCancel={() => dispatch({ type: 'cancelStaging' })}
        qualityOptions={qualityOptions}
        symptomOptions={symptomOptions}
        flagOptions={flagOptions}
      />
    </section>

    {/*
      The unified tile/activity management panel (real user feedback: the
      same top-bar Edit toggle must manage tiles/activities, not a second
      page reachable only from the sidebar — see `ActivityLibraryPanel`'s own
      doc comment). Deliberately rendered as its OWN top-level sibling here,
      outside the `<section>` above — two things found in self-review: (1)
      `TileRow` only renders at all in "slot mode" (the `selectedActivity`
      branch replaces that whole block with `ActivitySummary` instead), so a
      panel rendered inside `TileRow` vanished the moment any activity was
      selected; (2) the section above carries an `aria-label`/
      `aria-labelledby` naming it "Selected activity" or the slot heading —
      nesting an unrelated tile/activity management UI inside THAT landmark
      would leave it mislabeled (a screen-reader user landing on "Selected
      activity" would find a second, unrelated feature living inside it).
      `ActivityLibraryPanel` has its own `aria-label`, so as a sibling here it
      is its own honestly-named landmark instead.

      Lazy-mount-once, then kept alive and merely `hidden` (not unmounted)
      on every subsequent toggle — mirrors `TileRow`'s own established "stays
      mounted regardless" pattern for a toggled state (see that component's
      own test file: "the 9-tile row stays mounted regardless of slot
      capacity"). Plain `{editMode && (...)}` here (found in self-review)
      unmounted/remounted the panel on every single Edit toggle, resetting
      its own `selectedTileId`/`selectedActivityId` state to nothing and
      restarting its `useParameterOptions` fetch each time, so a user who
      drilled into one activity's options, glanced back at Today, then
      re-opened Edit mode lost their place every time. See
      `everOpenedManagementPanelRef`'s own comment above for why this isn't
      simply "always mounted" instead. `hidden` (a real HTML attribute, not
      just a visual `display:none` class) correctly drops it from the
      accessibility tree and tab order while off, same as any other
      conditionally-relevant region.
    */}
    {everOpenedManagementPanelRef.current && (
      <div className="mt-2xl ipad-land:mt-md" hidden={!editMode}>
        <ActivityLibraryPanel />
      </div>
    )}
    </>
  )
}
