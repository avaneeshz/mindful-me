import { HeaderBar } from '@/components/HeaderBar'
import { PeriodNavigator } from '@/components/PeriodNavigator'
import { Timeline } from '@/components/Timeline'
import { SlotEditor } from '@/components/editor/SlotEditor'
import { useBoard } from '@/state/BoardContext'

export function TodayPage() {
  const { state, dispatch, now, nowSlot } = useBoard()

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col px-2xl pt-lg mobile:px-lg mobile:pb-[132px] ipad-land:pt-md">
      <HeaderBar now={now} />

      <div className="mt-lg ipad-land:mt-sm">
        <PeriodNavigator
          focusedPeriod={state.focusedPeriod}
          onJump={(period) => dispatch({ type: 'focusPeriod', period })}
        />
      </div>

      <div className="mt-xl ipad-land:mt-md">
        <Timeline
          activities={state.activities}
          selectedSlot={state.selectedSlot}
          now={now}
          jump={state.jump}
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
      <div className="mb-5xl mt-2xl ipad-land:mb-lg ipad-land:mt-md">
        <SlotEditor state={state} dispatch={dispatch} nowSlot={nowSlot} />
      </div>
    </div>
  )
}
