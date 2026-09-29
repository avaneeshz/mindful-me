import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HealthDataTypeMeta } from '@/domain/healthMetrics'
import type { HealthMetricPoint } from '@/api/healthSync'

/**
 * One data type's trend — monochrome, matching this app's single-hue design
 * system (CLAUDE.md: "restrained colors"; the Ritual Board retheme's own
 * rule, "no per-category or per-item colour anywhere"). A single series
 * needs no legend box (the card's own heading already names it) — see the
 * dataviz skill's own exception for exactly this case.
 */

export interface ChartRow {
  label: string
  value: number
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Chart rows for a data type. Types that store several points per day
 * (`dayAggregate` other than `'none'`) are collapsed into one row per day so
 * a day with ten readings is one bar/point, not ten crowded on one label.
 */
export function toChartRows(points: HealthMetricPoint[], meta: HealthDataTypeMeta): ChartRow[] {
  const values = points
    .map((p) => ({ at: p.recordedAt, value: meta.toChartValue(p.value, p.unit) }))
    .filter((p): p is { at: string; value: number } => p.value !== null)

  const label = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (meta.dayAggregate === 'none') return values.map((p) => ({ label: label(p.at), value: p.value }))

  const byDay = new Map<string, { at: string; sum: number; n: number }>()
  for (const p of values) {
    const key = dayKey(p.at)
    const entry = byDay.get(key) ?? { at: p.at, sum: 0, n: 0 }
    entry.sum += p.value
    entry.n += 1
    byDay.set(key, entry)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, e]) => ({
      label: label(e.at),
      value: meta.dayAggregate === 'avg' ? Math.round((e.sum / e.n) * 10) / 10 : e.sum,
    }))
}

function ChartTooltip({ active, payload, meta }: { active?: boolean; payload?: any[]; meta: HealthDataTypeMeta }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as ChartRow
  return (
    <div className="rounded-md border border-line bg-surface px-md py-sm text-caption shadow-elevation-1">
      <div className="font-semibold text-ink">{meta.formatValue(row.value)}</div>
      <div className="text-ink-dim">{row.label}</div>
    </div>
  )
}

export function HealthMetricChart({ points, meta }: { points: HealthMetricPoint[]; meta: HealthDataTypeMeta }) {
  const rows = toChartRows(points, meta)

  if (rows.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-line text-caption text-ink-dim">
        No numeric data points in this window yet.
      </div>
    )
  }

  return (
    <div className="h-[180px] w-full" role="img" aria-label={`${meta.label} over time, ${meta.axisLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        {meta.chartKind === 'bar' ? (
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-dim)' }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--ink-dim)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltip meta={meta} />} cursor={{ fill: 'var(--line-soft)' }} />
            <Bar dataKey="value" fill="var(--ink)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        ) : (
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-dim)' }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--ink-dim)' }} axisLine={false} tickLine={false} width={40} domain={['dataMin', 'dataMax']} />
            <Tooltip content={<ChartTooltip meta={meta} />} cursor={{ stroke: 'var(--line)' }} />
            <Line type="monotone" dataKey="value" stroke="var(--ink)" strokeWidth={2} dot={{ r: 3, fill: 'var(--ink)' }} activeDot={{ r: 5 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
