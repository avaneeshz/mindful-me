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

/** The 11 permission groups the app asks Google for — the sections of the Health Sync screen, in display order. */
export const HEALTH_GROUPS = [
  { id: 'activity_and_fitness', label: 'Activity & fitness', blurb: 'Steps, distance, exercise, energy and active time.' },
  { id: 'health_metrics_and_measurements', label: 'Body & vitals', blurb: 'Heart rate, weight, oxygen, temperature, VO2 max and more.' },
  { id: 'sleep', label: 'Sleep', blurb: 'Sleep sessions.' },
  { id: 'ecg', label: 'ECG', blurb: 'Electrocardiogram readings.' },
  { id: 'irn', label: 'Rhythm alerts', blurb: 'Irregular rhythm notifications.' },
  { id: 'mindfulness', label: 'Mindfulness', blurb: 'Logged moods.' },
  { id: 'logged_symptoms', label: 'Symptoms', blurb: 'Symptoms you logged.' },
  { id: 'reproductive_health', label: 'Reproductive health', blurb: 'Menstrual periods and ovulation tests.' },
  { id: 'location', label: 'Location', blurb: 'Only used to export an exercise route; nothing is stored.' },
  { id: 'profile', label: 'Profile', blurb: 'Your Google Health profile.' },
  { id: 'settings', label: 'Settings', blurb: 'Your Google Health settings.' },
] as const

export type HealthGroupId = (typeof HEALTH_GROUPS)[number]['id']

/** How a data type is presented: a chart over time, an account card, or the full-day heart-rate view. */
export type HealthView = 'chart' | 'account' | 'intraday'

/** How several points on one day combine into the chart's single bar/point. */
export type DayAggregate = 'none' | 'sum' | 'avg' | 'count'

export interface HealthDataTypeMeta {
  id: string
  label: string
  group: HealthGroupId
  view: HealthView
  /** `'none'` plots each stored point; the others collapse a day's points into one. */
  dayAggregate: DayAggregate
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

type BaseMeta = Omit<HealthDataTypeMeta, 'group' | 'view' | 'dayAggregate'>

const BASE_DATA_TYPES: BaseMeta[] = [
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

const BASE_GROUPS: Record<string, HealthGroupId> = {
  steps: 'activity_and_fitness',
  distance: 'activity_and_fitness',
  floors: 'activity_and_fitness',
  altitude: 'activity_and_fitness',
  exercise: 'activity_and_fitness',
  'heart-rate': 'health_metrics_and_measurements',
  weight: 'health_metrics_and_measurements',
  sleep: 'sleep',
  electrocardiogram: 'ecg',
}

/** Plain numbers from the API, which sends 64-bit values as strings. */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function pathValue(value: unknown, path: string): unknown {
  let cur: unknown = value
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

const round1 = (n: number) => Math.round(n * 10) / 10

interface NumericSpec {
  label: string
  group: HealthGroupId
  unit: string
  /** Dotted path to the number inside a stored point. */
  path: string
  scale?: number
  chartKind?: 'bar' | 'line'
  dayAggregate?: 'avg' | 'sum'
}

/** A raw point carrying one headline number (a blood-glucose reading, a resting heart rate…). */
function numeric(id: string, spec: NumericSpec): HealthDataTypeMeta {
  const scale = spec.scale ?? 1
  return {
    id,
    label: spec.label,
    group: spec.group,
    view: 'chart',
    dayAggregate: spec.dayAggregate ?? 'avg',
    axisLabel: spec.unit,
    toChartValue: (v) => {
      const n = toNumber(pathValue(v, spec.path))
      return n === null ? null : n * scale
    },
    formatValue: (n) => `${round1(n)} ${spec.unit}`.trim(),
    chartKind: spec.chartKind ?? 'line',
  }
}

/** A busy interval type rolled into one row per day by the sync: `{ count, minutes, sum }`. */
function dailyTotal(id: string, label: string, unit: 'kcal' | 'min' | 'count'): HealthDataTypeMeta {
  return {
    id,
    label,
    group: 'activity_and_fitness',
    view: 'chart',
    dayAggregate: 'none',
    axisLabel: unit === 'kcal' ? 'Calories' : unit === 'min' ? 'Minutes' : 'Count',
    toChartValue: (v) => {
      const sum = toNumber(pathValue(v, 'sum'))
      if (unit === 'min') return toNumber(pathValue(v, 'minutes'))
      return sum ?? toNumber(pathValue(v, 'minutes'))
    },
    formatValue: (n) => (unit === 'kcal' ? `${Math.round(n)} kcal` : unit === 'min' ? `${Math.round(n)} min` : Math.round(n).toLocaleString()),
    chartKind: 'bar',
  }
}

/** An event type (a symptom, a mood, a period…): charted as how many entries fell on each day. */
function events(id: string, label: string, group: HealthGroupId): HealthDataTypeMeta {
  return {
    id,
    label,
    group,
    view: 'chart',
    dayAggregate: 'count',
    axisLabel: 'Entries',
    toChartValue: () => 1,
    formatValue: (n) => `${Math.round(n)} ${Math.round(n) === 1 ? 'entry' : 'entries'}`,
    chartKind: 'bar',
  }
}

const HM = 'health_metrics_and_measurements'

const EXTRA_DATA_TYPES: HealthDataTypeMeta[] = [
  {
    id: 'heart-rate-intraday',
    label: 'Heart rate through the day',
    group: HM,
    view: 'intraday',
    dayAggregate: 'none',
    axisLabel: 'BPM',
    toChartValue: () => null,
    formatValue: (n) => `${Math.round(n)} bpm`,
    chartKind: 'line',
  },
  dailyTotal('active-energy-burned', 'Active calories', 'kcal'),
  dailyTotal('basal-energy-burned', 'Resting calories', 'kcal'),
  dailyTotal('active-minutes', 'Active minutes', 'min'),
  dailyTotal('activity-level', 'Activity level time', 'min'),
  dailyTotal('active-zone-minutes', 'Active zone minutes', 'count'),
  dailyTotal('sedentary-period', 'Sedentary time', 'min'),
  dailyTotal('swim-lengths-data', 'Swim strokes', 'count'),
  dailyTotal('time-in-heart-rate-zone', 'Time in heart-rate zones', 'min'),
  numeric('blood-glucose', { label: 'Blood glucose', group: HM, unit: 'mg/dL', path: 'bloodGlucoseMilligramsPerDeciliter' }),
  numeric('body-fat', { label: 'Body fat', group: HM, unit: '%', path: 'percentage' }),
  numeric('core-body-temperature', { label: 'Body temperature', group: HM, unit: '°C', path: 'temperatureCelsius' }),
  numeric('heart-rate-variability', { label: 'Heart rate variability', group: HM, unit: 'ms', path: 'rootMeanSquareOfSuccessiveDifferencesMilliseconds' }),
  numeric('height', { label: 'Height', group: HM, unit: 'cm', path: 'heightMillimeters', scale: 0.1 }),
  numeric('oxygen-saturation', { label: 'Oxygen saturation', group: HM, unit: '%', path: 'percentage' }),
  events('respiratory-rate-sleep-summary', 'Sleep breathing summaries', HM),
  numeric('run-vo2-max', { label: 'Running VO2 max', group: HM, unit: 'ml/kg/min', path: 'runVo2Max' }),
  numeric('vo2-max', { label: 'VO2 max', group: HM, unit: 'ml/kg/min', path: 'vo2Max' }),
  numeric('daily-heart-rate-variability', { label: 'Daily heart rate variability', group: HM, unit: 'ms', path: 'averageHeartRateVariabilityMilliseconds' }),
  events('daily-heart-rate-zones', 'Daily heart-rate zones', HM),
  numeric('daily-oxygen-saturation', { label: 'Daily oxygen saturation', group: HM, unit: '%', path: 'averagePercentage' }),
  numeric('daily-respiratory-rate', { label: 'Daily breathing rate', group: HM, unit: 'breaths/min', path: 'breathsPerMinute' }),
  numeric('daily-resting-heart-rate', { label: 'Resting heart rate', group: HM, unit: 'bpm', path: 'beatsPerMinute' }),
  numeric('daily-sleep-temperature-derivations', { label: 'Sleep skin temperature', group: HM, unit: '°C', path: 'nightlyTemperatureCelsius' }),
  numeric('daily-vo2-max', { label: 'Daily VO2 max', group: HM, unit: 'ml/kg/min', path: 'vo2Max' }),
  events('irregular-rhythm-notification', 'Irregular rhythm alerts', 'irn'),
  events('symptoms', 'Symptoms', 'logged_symptoms'),
  events('moods', 'Moods', 'mindfulness'),
  events('menstrual-period', 'Menstrual periods', 'reproductive_health'),
  events('ovulation-test', 'Ovulation tests', 'reproductive_health'),
  ...(['profile', 'settings'] as const).map(
    (id): HealthDataTypeMeta => ({
      id,
      label: id === 'profile' ? 'Profile' : 'Settings',
      group: id,
      view: 'account',
      dayAggregate: 'none',
      axisLabel: '',
      toChartValue: () => null,
      formatValue: (n) => String(n),
      chartKind: 'bar',
    }),
  ),
]

/** Every data type this app knows how to present, in the order the Health Sync screen lists them. */
export const HEALTH_DATA_TYPES: HealthDataTypeMeta[] = [
  ...BASE_DATA_TYPES.map(
    (dt): HealthDataTypeMeta => ({ ...dt, group: BASE_GROUPS[dt.id], view: 'chart', dayAggregate: 'none' }),
  ),
  ...EXTRA_DATA_TYPES,
]

/** The known data types of one group, in display order. */
export function healthTypesInGroup(group: HealthGroupId): HealthDataTypeMeta[] {
  return HEALTH_DATA_TYPES.filter((dt) => dt.group === group)
}

const BY_ID = new Map(HEALTH_DATA_TYPES.map((dt) => [dt.id, dt]))

/** Falls back to a generic, still-honest meta for any `data_type` synced by a future registry entry this module hasn't been updated for yet — never throws on an unknown id. */
export function healthDataTypeMeta(dataType: string): HealthDataTypeMeta {
  return (
    BY_ID.get(dataType) ?? {
      id: dataType,
      label: dataType.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      group: 'health_metrics_and_measurements',
      view: 'chart',
      dayAggregate: 'none',
      axisLabel: 'Value',
      toChartValue: () => null,
      formatValue: (v) => String(v),
      chartKind: 'bar',
    }
  )
}

// ---------------------------------------------------------------------
// Heart rate through a day
// ---------------------------------------------------------------------

export interface HeartRateDayData {
  /** `[minute of the local day, average bpm]`. */
  points: Array<[number, number]>
  min: number
  max: number
  avg: number
  count: number
}

/** The stored day value, or `null` if it isn't shaped like one (never throws on a bad row). */
export function parseHeartRateDay(value: unknown): HeartRateDayData | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.points)) return null
  const points: Array<[number, number]> = []
  for (const p of v.points) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') points.push([p[0], p[1]])
  }
  const min = toNumber(v.min)
  const max = toNumber(v.max)
  const avg = toNumber(v.avg)
  if (points.length === 0 || min === null || max === null || avg === null) return null
  return { points, min, max, avg, count: toNumber(v.count) ?? points.length }
}

/** `HH:MM` for a minute of the day (`0` -> `00:00`, `1439` -> `23:59`). */
export function minuteLabel(minute: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minute)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * The calendar day a stored day-row belongs to. The row spans the person's
 * local day, so its midpoint is safely inside that day whatever zone the
 * browser is in — using the start would land on the wrong date for anyone
 * west of the person's own zone.
 */
export function dayOfRow(recordedAt: string, endAt: string | null): { key: string; label: string } {
  const start = new Date(recordedAt).getTime()
  const end = endAt ? new Date(endAt).getTime() : start + 24 * 3600_000
  const mid = new Date(start + (end - start) / 2)
  const key = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`
  return { key, label: mid.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) }
}

// ---------------------------------------------------------------------
// Readable details for any stored point
// ---------------------------------------------------------------------

const SKIPPED_KEYS = new Set(['interval', 'sampleTime', 'date', 'metadata', 'name'])

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function plainText(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    const parts = v.map(plainText).filter((p): p is string => p !== null)
    return parts.length ? parts.join(', ') : null
  }
  return null
}

/**
 * A stored point as `label: value` lines a person can read — for types with no
 * single headline number, and for the account cards. Skips time fields and
 * metadata, flattens one level of nesting, and caps the length. Never throws.
 */
export function describeHealthValue(value: unknown, limit = 12): Array<{ label: string; text: string }> {
  if (value === null || typeof value !== 'object') {
    const t = plainText(value)
    return t === null ? [] : [{ label: 'Value', text: t }]
  }
  const out: Array<{ label: string; text: string }> = []
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, v] of Object.entries(obj)) {
      if (out.length >= limit) return
      if (SKIPPED_KEYS.has(key)) continue
      const label = prefix ? `${prefix} · ${humanize(key).toLowerCase()}` : humanize(key)
      const text = plainText(v)
      if (text !== null) out.push({ label, text })
      else if (v !== null && typeof v === 'object' && !Array.isArray(v) && !prefix) walk(v as Record<string, unknown>, humanize(key))
    }
  }
  walk(value as Record<string, unknown>, '')
  return out
}

/** Readable lines for the most recent point — how a profile/settings snapshot is shown. `[]` when there is none. */
export function latestHealthDetails(points: ReadonlyArray<{ recordedAt: string; value: unknown }>, limit = 20): Array<{ label: string; text: string }> {
  let latest: { recordedAt: string; value: unknown } | undefined
  for (const p of points) if (!latest || p.recordedAt > latest.recordedAt) latest = p
  return latest ? describeHealthValue(latest.value, limit) : []
}
