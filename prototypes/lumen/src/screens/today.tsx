import { DayFlow } from '@/components/today/day-flow'
import { DayToolbar, TodayHeader } from '@/components/today/header'
import { MetricTiles } from '@/components/today/metrics'
import { RhythmCards } from '@/components/today/rhythm'
import { SlotCard } from '@/components/today/slot-card'

export function TodayScreen() {
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <TodayHeader />
      <DayToolbar />
      {/* One column on phones and portrait tablets; two from landscape tablet up. */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 md:gap-5">
          <MetricTiles />
          <RhythmCards />
          <div className="hidden lg:block">
            <DayFlow />
          </div>
        </div>
        <div className="lg:sticky lg:top-8">
          <SlotCard />
        </div>
        <div className="lg:hidden">
          <DayFlow />
        </div>
      </div>
    </div>
  )
}
