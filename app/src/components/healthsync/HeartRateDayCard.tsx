import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, HeartPulse, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeartRateDayChart } from '@/components/healthsync/HeartRateDayChart'
import { useHeartRateDays } from '@/state/useHealthMetrics'

const HISTORY_DAYS = 30

/**
 * The whole day's heart rate, one reading per minute, with a day picker over
 * the last two weeks. Reads the `heart-rate-intraday` rows the sync writes
 * (one per local day) via `useHeartRateDays`.
 */
export function HeartRateDayCard({ refreshKey }: { refreshKey: number }) {
  const days = useHeartRateDays({ days: HISTORY_DAYS, refreshKey })
  const [selected, setSelected] = useState(0)
  // Land on the most recent day whenever a fresh set of days arrives.
  const count = days?.length ?? 0
  useEffect(() => setSelected(Math.max(0, count - 1)), [count])

  const day = days?.[selected]

  return (
    <section aria-labelledby="hr-day-heading" className="rounded-md border border-line-soft bg-surface p-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <h2 id="hr-day-heading" className="flex items-center gap-sm text-body font-semibold text-ink">
          <HeartPulse aria-hidden="true" className="size-[18px]" />
          Heart rate through the day
        </h2>
        {days && days.length > 0 ? (
          <div className="flex items-center gap-xs">
            <Button
              variant="outline"
              size="control"
              className="px-md"
              aria-label="Previous day"
              disabled={selected <= 0}
              onClick={() => setSelected((i) => i - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-[16px]" />
            </Button>
            <span className="min-w-[120px] text-center text-caption font-medium text-ink" aria-live="polite">
              {day?.label}
            </span>
            <Button
              variant="outline"
              size="control"
              className="px-md"
              aria-label="Next day"
              disabled={selected >= days.length - 1}
              onClick={() => setSelected((i) => i + 1)}
            >
              <ChevronRight aria-hidden="true" className="size-[16px]" />
            </Button>
          </div>
        ) : null}
      </div>

      {days === null ? (
        <div className="flex h-[220px] items-center justify-center text-ink-dim">
          <Loader2 aria-hidden="true" className="size-[20px] animate-spin" />
          <span className="sr-only">Loading heart rate…</span>
        </div>
      ) : !day ? (
        <div className="mt-lg flex h-[160px] items-center justify-center rounded-md border border-dashed border-line px-lg text-center text-caption text-ink-dim">
          No heart-rate readings synced yet. Once your device has recorded some, sync again and each day appears here.
        </div>
      ) : (
        <>
          <dl className="mt-md grid grid-cols-3 gap-md text-center">
            {[
              ['Lowest', day.data.min],
              ['Average', day.data.avg],
              ['Highest', day.data.max],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-micro text-ink-dim">{label}</dt>
                <dd className="text-body font-semibold text-ink">{Math.round(value as number)} bpm</dd>
              </div>
            ))}
          </dl>
          <div className="mt-md">
            <HeartRateDayChart data={day.data} dayLabel={day.label} />
          </div>
          <p className="mt-sm text-micro text-ink-dim">
            One reading per minute · {day.data.count.toLocaleString()} readings averaged
          </p>
        </>
      )}
    </section>
  )
}
