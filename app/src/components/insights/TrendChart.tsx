import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDurationMinutes } from '@/domain/insights'

export interface TrendPoint {
  key: string
  /** Short axis tick — e.g. "24" (day) or "Aug 23" (week start). */
  label: string
  /** Full wording for the tooltip — e.g. "Mon, Aug 24" or "Week of Aug 23". */
  fullLabel: string
  minutes: number
}

/**
 * A clean, honest trend of real historical totals — one series, so no
 * legend is needed (the section heading + the category filter chips above it
 * already say what's plotted). `color` is a `var(--cat-*-deep)` reference for
 * a single selected category; omitted (the "All categories" filter) falls
 * back to the brand Forest tone via a Tailwind class, never a raw hex.
 */
export function TrendChart({ points, color }: { points: TrendPoint[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} className="stroke-line" />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          tick={{ fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#8A8478' }}
        />
        <YAxis hide domain={[0, 'dataMax']} />
        <Tooltip
          cursor={{ className: 'fill-bg' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as TrendPoint
            return (
              <div className="rounded-sm border border-line bg-white px-md py-sm text-caption font-semibold text-charcoal shadow-elevation-2">
                {point.fullLabel}: {formatDurationMinutes(point.minutes)}
              </div>
            )
          }}
        />
        <Bar
          dataKey="minutes"
          fill={color ?? 'currentColor'}
          className={color ? undefined : 'text-forest'}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
