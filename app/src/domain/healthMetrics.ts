/**
 * Pure display logic for Health Sync data — no React, no state, matching
 * this repo's domain-layer convention. Mirrors (deliberately, in plain
 * comments rather than a shared import — this module is Vite/browser code,
 * the registry it mirrors is Deno Edge Function code with no build step in
 * common) the `DATA_TYPES` registry in
 * `supabase/functions/_shared/googleHealth.ts`: one entry per data type this
 * app currently syncs, plus how to turn its raw `{value, unit}` (as
 * `list_health_metrics` hands it back, `value` already `JSON.parse`d) into
 * something a chart or a person can read.
 */

export interface HealthDataTypeMeta {
  id: string
  label: string
  /** Recharts needs one axis, one meaning per chart (CLAUDE.md/dataviz: never a dual axis) — this is that meaning. */
  axisLabel: string
  /** Converts the raw stored value (already unwrapped from JSON) + raw unit into a chart-ready number, or `null` if this point isn't numeric (falls back to the detail-list view). */
  toChartValue: (value: unknown, unit: string | null) => number | null
  /** Formats a chart value for an axis tick / tooltip. */
  formatValue: (value: number) => string
  /** `'bar'` for a discrete daily total, `'line'` for a smoother trend read. */
  chartKind: 'bar' | 'line'
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString()

export const HEALTH_DATA_TYPES: HealthDataTypeMeta[] = [
  {
    id: 'steps',
    label: 'Steps',
    axisLabel: 'Steps',
    toChartValue: (v) => numberOrNull(v),
    formatValue: (v) => Math.round(v).toLocaleString(),
    chartKind: 'bar',
  },
  {
    id: 'distance',
    label: 'Distance',
    axisLabel: 'Kilometers',
    // Stored in millimeters (Google's own unit) — converted to km for display only.
    toChartValue: (v) => {
      const mm = numberOrNull(v)
      return mm === null ? null : mm / 1_000_000
    },
    formatValue: (v) => `${oneDecimal(v)} km`,
    chartKind: 'bar',
  },
  {
    id: 'floors',
    label: 'Floors climbed',
    axisLabel: 'Floors',
    toChartValue: (v) => numberOrNull(v),
    formatValue: (v) => Math.round(v).toLocaleString(),
    chartKind: 'bar',
  },
  {
    id: 'altitude',
    label: 'Altitude gain',
    axisLabel: 'Meters',
    toChartValue: (v) => {
      const mm = numberOrNull(v)
      return mm === null ? null : mm / 1_000
    },
    formatValue: (v) => `${oneDecimal(v)} m`,
    chartKind: 'bar',
  },
  {
    id: 'exercise',
    label: 'Exercise sessions',
    axisLabel: 'Minutes',
    toChartValue: (v) => numberOrNull(v),
    formatValue: (v) => `${Math.round(v)} min`,
    chartKind: 'bar',
  },
  {
    id: 'heart-rate',
    label: 'Heart rate',
    axisLabel: 'BPM (daily avg)',
    toChartValue: (v) => numberOrNull(v),
    formatValue: (v) => `${Math.round(v)} bpm`,
    chartKind: 'line',
  },
  {
    id: 'weight',
    label: 'Weight',
    axisLabel: 'Kilograms',
    toChartValue: (v) => {
      const grams = numberOrNull(v)
      return grams === null ? null : grams / 1_000
    },
    formatValue: (v) => `${oneDecimal(v)} kg`,
    chartKind: 'line',
  },
  {
    id: 'sleep',
    label: 'Sleep',
    axisLabel: 'Hours asleep',
    toChartValue: (v) => {
      const minutes = numberOrNull(v)
      return minutes === null ? null : minutes / 60
    },
    formatValue: (v) => `${oneDecimal(v)} h`,
    chartKind: 'bar',
  },
  {
    id: 'electrocardiogram',
    label: 'ECG',
    axisLabel: 'BPM',
    toChartValue: (v) => numberOrNull(v),
    formatValue: (v) => `${Math.round(v)} bpm`,
    chartKind: 'line',
  },
]

const BY_ID = new Map(HEALTH_DATA_TYPES.map((dt) => [dt.id, dt]))

/** Falls back to a generic, still-honest meta for any `data_type` synced by a future registry entry this module hasn't been updated for yet — never throws on an unknown id. */
export function healthDataTypeMeta(dataType: string): HealthDataTypeMeta {
  return (
    BY_ID.get(dataType) ?? {
      id: dataType,
      label: dataType.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      axisLabel: 'Value',
      toChartValue: () => null,
      formatValue: (v) => String(v),
      chartKind: 'bar',
    }
  )
}
