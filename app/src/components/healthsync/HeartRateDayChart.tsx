import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { minuteLabel, type HeartRateDayData } from '@/domain/healthMetrics'
import { CLASSIC_CHART_PALETTE, type HealthChartPalette } from './chartPalette'

function HeartTooltip({ active, payload, palette }: { active?: boolean; payload?: any[]; palette: HealthChartPalette }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { minute: number; bpm: number }
  return (
    <div className={palette.tooltipClass}>
      <div className={palette.tooltipValueClass}>{Math.round(row.bpm)} bpm</div>
      <div className={palette.tooltipLabelClass}>{minuteLabel(row.minute)}</div>
    </div>
  )
}

/**
 * One day's heart rate, one point per minute, midnight to midnight. Shared by
 * Classic's Health Sync page and Lumen's Health data screen — each passes its
 * own palette.
 */
export function HeartRateDayChart({
  data,
  dayLabel,
  palette = CLASSIC_CHART_PALETTE,
  height = 220,
}: {
  data: HeartRateDayData
  dayLabel: string
  palette?: HealthChartPalette
  height?: number
}) {
  const rows = data.points.map(([minute, bpm]) => ({ minute, bpm }))
  const tick = { fontSize: 11, fill: palette.tick }
  return (
    <div
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={`Heart rate on ${dayLabel}: lowest ${Math.round(data.min)}, average ${Math.round(data.avg)}, highest ${Math.round(data.max)} beats per minute`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
          <XAxis
            dataKey="minute"
            type="number"
            domain={[0, 1439]}
            ticks={[0, 360, 720, 1080, 1439]}
            tickFormatter={minuteLabel}
            tick={tick}
            axisLine={{ stroke: palette.axis }}
            tickLine={false}
          />
          <YAxis
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={['dataMin - 5', 'dataMax + 5']}
            tickFormatter={(v: number) => String(Math.round(v))}
          />
          <Tooltip content={<HeartTooltip palette={palette} />} cursor={{ stroke: palette.axis }} />
          <Area type="monotone" dataKey="bpm" stroke={palette.mark} strokeWidth={1.5} fill={palette.mark} fillOpacity={0.08} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
