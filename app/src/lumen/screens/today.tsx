import { DayFlow } from '@/lumen/components/today/day-flow'
import { DayToolbar, TodayHeader } from '@/lumen/components/today/header'
import { DayStrips } from '@/lumen/components/today/day-strips'
import { SlotCard } from '@/lumen/components/today/slot-card'

export function TodayScreen() {
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <TodayHeader />
      {/* On phones the toolbar lives in the header row */}
      <div className="hidden md:block">
        <DayToolbar />
      </div>
      {/* One column on phones and portrait tablets; two from landscape tablet up. */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 md:gap-5">
          <DayStrips />
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
