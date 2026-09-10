import { useEffect, useMemo, useState } from 'react'
import { HeaderBar } from '@/components/HeaderBar'
import { ReflectionMappingPopover, type PendingReflectionMapping } from '@/components/ReflectionMappingPopover'
import { ReflectionSection } from '@/components/ReflectionSection'
import { ThemeFromSlot } from '@/components/ThemeFromSlot'
import { Timeline } from '@/components/Timeline'
import { SlotEditor } from '@/components/editor/SlotEditor'
import { toBoardActivities } from '@/domain/window'
import { useAuth } from '@/state/AuthContext'
import { useBoard } from '@/state/BoardContext'

export function TodayPage() {
  const { state, dispatch, now, nowSlot, viewedDate, isViewingToday, setViewedDate } = useBoard()
  const { user, signOut } = useAuth()

  // The timeline + the quick-log popovers reason about grid positions and
  // overlaps, so they get activities mapped into board-minute space for the
  // current 6am-to-6am window (`domain/window.ts`). `SlotEditor` maps its own
  // (it has the whole `state`); `ReflectionSection` is id-only, so it keeps
  // the real list.
  const boardActivities = useMemo(
    () => toBoardActivities(state.activities, state.viewedDate),
    [state.activities, state.viewedDate],
  )

  // Which activity + reflection card the note-entry popup is currently open
  // for, if any — set by EITHER path of reflection-card mapping (a grid
  // click while an activity is selected, or a card dropped directly onto an
  // activity's timeline segment). Purely local UI state: it never affects
  // `state.activities` until Save/Remove actually dispatches.
  const [pendingMapping, setPendingMapping] = useState<PendingReflectionMapping | null>(null)

  // The mapping popup targets an activity by id. A `hydrate` (date switch,
  // midnight rollover, background server reconcile) can swap a client UUID
  // for a server id or drop the activity entirely — if the pending target is
  // no longer in `state.activities`, close the popup rather than let Save
  // dispatch against a stale id (which the reducer would silently no-op,
  // losing the typed note).
  useEffect(() => {
    if (pendingMapping && !state.activities.some((a) => a.id === pendingMapping.scheduledActivityId)) {
      setPendingMapping(null)
    }
  }, [state.activities, pendingMapping])

  // Opens the note-entry popup for a (selected activity, card) pairing.
  // Shared by both entry points — tapping a card in the Reflection grid, and
  // tapping a mapped thumbnail in the activity summary. Only ever fires with
  // an activity selected (the grid shows its own inline hint otherwise).
  function openMapping(card: number) {
    if (state.selectedActivityId) {
      setPendingMapping({ scheduledActivityId: state.selectedActivityId, card })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col px-2xl pt-lg mobile:px-lg mobile:pb-[132px] ipad-land:pt-md">
      {/* Derives the light/dark theme from the selected slot; renders nothing. */}
      <ThemeFromSlot />
      <HeaderBar
        now={now}
        viewedDate={viewedDate}
        onSelectDate={setViewedDate}
        user={user}
        onSignOut={signOut}
        activities={boardActivities}
        onQuickLog={(cardName, startMinutes, durationMinutes) =>
          dispatch({ type: 'quickLogActivity', cardName, startMinutes, durationMinutes })
        }
      />

      <div className="mt-xl ipad-land:mt-md">
        <Timeline
          activities={boardActivities}
          selectedSlot={state.selectedSlot}
          // BL-2: the NOW marker only ever belongs on the real current day —
          // `null` here means Timeline draws none at all.
          now={isViewingToday ? now : null}
          onSelectSlot={(slot) => dispatch({ type: 'selectSlot', slot })}
          onDropCard={(cardName, slot) => dispatch({ type: 'dropCard', cardName, slot })}
          onSelectActivity={(id) => dispatch({ type: 'selectScheduledActivity', id })}
          selectedActivityId={state.selectedActivityId}
          onQuickLog={(cardName, startMinutes, durationMinutes) =>
            dispatch({ type: 'quickLogActivity', cardName, startMinutes, durationMinutes })
          }
        />
      </div>

      {/*
        Acceptance Criterion 13 — the primary action must be reachable with no
        scrolling on the client's actual device (iPad landscape, 1194x834). The
        trailing breathing margin is the last thing worth spending pixels on
        there, so it halves alongside the top-zone gaps.
      */}
      <div className="mt-2xl ipad-land:mt-md">
        <SlotEditor
          state={state}
          dispatch={dispatch}
          // Same rule as the Timeline marker above: the "Now" badge on a
          // selected slot only means something while viewing today.
          nowSlot={isViewingToday ? nowSlot : -1}
          viewedDate={viewedDate}
          onOpenReflectionNote={openMapping}
        />
      </div>

      <div className="mb-5xl mt-2xl ipad-land:mb-lg ipad-land:mt-md">
        <ReflectionSection
          activities={state.activities}
          selectedActivityId={state.selectedActivityId}
          onRequestMapping={openMapping}
        />
      </div>

      <ReflectionMappingPopover
        pending={pendingMapping}
        activities={state.activities}
        onSave={(note) => {
          if (pendingMapping) {
            dispatch({ type: 'mapReflectionCard', ...pendingMapping, note })
          }
          setPendingMapping(null)
        }}
        onRemove={() => {
          if (pendingMapping) {
            dispatch({ type: 'unmapReflectionCard', ...pendingMapping })
          }
          setPendingMapping(null)
        }}
        onClose={() => setPendingMapping(null)}
      />
    </div>
  )
}
