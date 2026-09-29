import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, HeartPulse, Loader2 } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiListHealthMetrics } from '@/api/healthSync'
import { dayOfRow, minuteLabel, parseHeartRateDay, type HeartRateDayData } from '@/domain/healthMetrics'
import { Button } from '@/components/ui/button'

const HISTORY_DAYS = 14

interface DayEntry {
  key: string
  label: string
  data: HeartRateDayData
}

function HeartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { minute: number; bpm: number }
  return (
    <div className="rounded-md border border-line bg-surface px-md py-sm text-caption shadow-elevation-1">
      <div className="font-semibold text-ink">{Math.round(row.bpm)} bpm</div>
      <div className="text-ink-dim">{minuteLabel(row.minute)}</div>
    </div>
  )
}

/**
 * The whole day's heart rate, one reading per minute, with a day picker over
 * the last two weeks. Reads the `heart-rate-intraday` rows the sync writes
 * (one per local day) through the same bounded-window RPC as everything else.
 */
export function HeartRateDayCard({ refreshKey }: { refreshKey: number }) {
  const [days, setDays] = useState<DayEntry[] | null>(null)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    let cancelled = false
    const end = new Date(Date.now() + 24 * 3600_000)
    const start = new Date(end.getTime() - (HISTORY_DAYS + 2) * 24 * 3600_000)
    apiListHealthMetrics('heart-rate-intraday', start, end).then((points) => {
      if (cancelled) return
      const entries: DayEntry[] = []
      for (const p of points ?? []) {
        const data = parseHeartRateDay(p.value)
        if (!data) continue
        const { key, label } = dayOfRow(p.recordedAt, p.endAt)
        entries.push({ key, label, data })
      }
      entries.sort((a, b) => (a.key < b.key ? -1 : 1))
      setDays(entries)
      setSelected(Math.max(0, entries.length - 1))
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const day = days?.[selected]
  const rows = useMemo(() => (day ? day.data.points.map(([minute, bpm]) => ({ minute, bpm })) : []), [day])

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
          <div
            className="mt-md h-[220px] w-full"
            role="img"
            aria-label={`Heart rate on ${day.label}: lowest ${Math.round(day.data.min)}, average ${Math.round(day.data.avg)}, highest ${Math.round(day.data.max)} beats per minute`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
                <XAxis
                  dataKey="minute"
                  type="number"
                  domain={[0, 1439]}
                  ticks={[0, 360, 720, 1080, 1439]}
                  tickFormatter={minuteLabel}
                  tick={{ fontSize: 11, fill: 'var(--ink-dim)' }}
                  axisLine={{ stroke: 'var(--line)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--ink-dim)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  domain={['dataMin - 5', 'dataMax + 5']}
                  tickFormatter={(v: number) => String(Math.round(v))}
                />
                <Tooltip content={<HeartTooltip />} cursor={{ stroke: 'var(--line)' }} />
                <Area type="monotone" dataKey="bpm" stroke="var(--ink)" strokeWidth={1.5} fill="var(--ink)" fillOpacity={0.08} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-sm text-micro text-ink-dim">
            One reading per minute · {day.data.count.toLocaleString()} readings averaged
          </p>
        </>
      )}
    </section>
  )
}
