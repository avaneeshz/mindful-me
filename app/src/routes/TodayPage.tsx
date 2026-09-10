import { useState } from 'react'
import { HeaderBar } from '@/components/HeaderBar'
import { ReflectionMappingPopover, type PendingReflectionMapping } from '@/components/ReflectionMappingPopover'
import { ReflectionSection } from '@/components/ReflectionSection'
import { ThemeFromSlot } from '@/components/ThemeFromSlot'
import { Timeline } from '@/components/Timeline'
import { SlotEditor } from '@/components/editor/SlotEditor'
import { useAuth } from '@/state/AuthContext'
import { useBoard } from '@/state/BoardContext'

export function TodayPage() {
  const { state, dispatch, now, nowSlot, viewedDate, isViewingToday, setViewedDate } = useBoard()
  const { user, signOut } = useAuth()

  // Which activity + reflection card the note-entry popup is currently open
  // for, if any — set by EITHER path of reflection-card mapping (a grid
  // click while an activity is selected, or a card dropped directly onto an
  // activity's timeline segment). Purely local UI state: it never affects
  // `state.activities` until Save/Remove actually dispatches.
  const [pendingMapping, setPendingMapping] = useState<PendingReflectionMapping | null>(null)

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
        activities={state.activities}
        onQuickLog={(cardName, startMinutes, durationMinutes) =>
          dispatch({ type: 'quickLogActivity', cardName, startMinutes, durationMinutes })
        }
      />

      <div className="mt-xl ipad-land:mt-md">
        <Timeline
          activities={state.activities}
          selectedSlot={state.selectedSlot}
          // BL-2: the NOW marker only ever belongs on the real current day —
          // `null` here means Timeline draws none at all.
          now={isViewingToday ? now : null}
          onSelectSlot={(slot) => dispatch({ type: 'selectSlot', slot })}
          onDropCard={(cardName, slot) => dispatch({ type: 'dropCard', cardName, slot })}
          onSelectActivity={(id) => dispatch({ type: 'selectScheduledActivity', id })}
          selectedActivityId={state.selectedActivityId}
          onDropReflectionCard={(scheduledActivityId, card) => setPendingMapping({ scheduledActivityId, card })}
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
        />
      </div>

      <div className="mb-5xl mt-2xl ipad-land:mb-lg ipad-land:mt-md">
        <ReflectionSection
          activities={state.activities}
          selectedActivityId={state.selectedActivityId}
          onRequestMapping={(card) => {
            // Click path — only meaningful while an activity is selected;
            // the drag path (Timeline's onDropReflectionCard above) already
            // names its own target directly and never goes through this.
            if (state.selectedActivityId) {
              setPendingMapping({ scheduledActivityId: state.selectedActivityId, card })
            }
          }}
          onDeselect={() => dispatch({ type: 'selectScheduledActivity', id: null })}
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
