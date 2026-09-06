import { HeaderBar } from '@/components/HeaderBar'
import { ReflectionSection } from '@/components/ReflectionSection'
import { Timeline } from '@/components/Timeline'
import { SlotEditor } from '@/components/editor/SlotEditor'
import { useAuth } from '@/state/AuthContext'
import { useBoard } from '@/state/BoardContext'

export function TodayPage() {
  const { state, dispatch, now, nowSlot, viewedDate, isViewingToday, setViewedDate } = useBoard()
  const { user, signOut } = useAuth()

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col px-2xl pt-lg mobile:px-lg mobile:pb-[132px] ipad-land:pt-md">
      <HeaderBar
        now={now}
        viewedDate={viewedDate}
        onSelectDate={setViewedDate}
        user={user}
        onSignOut={signOut}
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
        <ReflectionSection />
      </div>
    </div>
  )
}
