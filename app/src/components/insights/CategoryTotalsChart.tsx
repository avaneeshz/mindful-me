import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CATEGORIES } from '@/data/activities'
import { CATEGORY_ORDER, formatDurationMinutes, type CategoryMinutes } from '@/domain/insights'
import type { CategoryId } from '@/domain/types'

interface Row {
  id: CategoryId
  label: string
  minutes: number
}

/**
 * Compare-magnitude, ranked-but-fixed-order categories -> a horizontal bar
 * (long category names rule out a vertical/column layout — see the
 * `dataviz` skill's form table). Bars are always in `CATEGORY_ORDER`, never
 * re-sorted by value: the same category sits in the same row every time this
 * screen is opened, which is what makes day-to-day comparison legible.
 *
 * Identity comes from the row's own text label (the Y axis), not from hue —
 * the 5 category tones already used across the Timeline/picker fail this
 * skill's categorical-palette CVD checks on their own (they were tuned for
 * large filled tiles with a paired foreground, not thin chart marks), so
 * colour here is reinforcement only, and the value is always direct-labeled
 * at the bar's tip regardless.
 */
export function CategoryTotalsChart({ minutesByCategory }: { minutesByCategory: CategoryMinutes }) {
  const rows: Row[] = CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORIES[id].label,
    minutes: minutesByCategory[id],
  }))
  const maxMinutes = Math.max(1, ...rows.map((row) => row.minutes))
  // Headroom so the longest bar never reaches the plot's own right edge —
  // otherwise its direct label has nowhere to sit and wraps mid-word, which
  // happens well before 1.2x on a narrow (mobile-width) card.
  const domainMax = Math.ceil(maxMinutes * 1.5)

  return (
    <ResponsiveContainer width="100%" height={rows.length * 44 + 8}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
        barCategoryGap={14}
      >
        <XAxis type="number" domain={[0, domainMax]} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={148}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif', fill: '#3D3A35' }}
        />
        <Tooltip
          cursor={{ className: 'fill-bg' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as Row
            return (
              <div className="rounded-sm border border-line bg-white px-md py-sm text-caption font-semibold text-charcoal shadow-elevation-2">
                {row.label}: {formatDurationMinutes(row.minutes)}
              </div>
            )
          }}
        />
        <Bar dataKey="minutes" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.id} fill={CATEGORIES[row.id].deep} />
          ))}
          <LabelList
            dataKey="minutes"
            position="right"
            formatter={(value) => (typeof value === 'number' && value > 0 ? formatDurationMinutes(value) : '')}
            className="fill-muted text-[11.5px] font-semibold"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
