/**
 * Facts about the Google Health API verified against the real
 * `@googleapis/health@6.0.0` client (`npm pack` + read `v4.ts`) rather than
 * training-data memory — see the task brief this shipped from for how. Kept
 * as its own module so both Edge Functions (and, for the scope list, the
 * frontend's authorize-URL builder) read from one source of truth.
 */

export const GOOGLE_HEALTH_BASE_URL = 'https://health.googleapis.com/v4/'
export const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_OAUTH_AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

export const HEALTH_SCOPE_PREFIX = 'https://www.googleapis.com/auth/googlehealth.'

/** Every readonly scope category the API exposes. `nutrition` has no `.readonly` — writeonly only — so it's deliberately absent (there is no readable nutrition data to build a reader for). */
export const HEALTH_SCOPE_CATEGORIES = [
  'activity_and_fitness',
  'sleep',
  'health_metrics_and_measurements',
  'ecg',
  'irn',
  'location',
  'mindfulness',
  'logged_symptoms',
  'reproductive_health',
  'profile',
  'settings',
] as const

export type HealthScopeCategory = (typeof HEALTH_SCOPE_CATEGORIES)[number]

export function fullScope(category: HealthScopeCategory): string {
  return `${HEALTH_SCOPE_PREFIX}${category}.readonly`
}

/** Every scope this app requests — "everything the API exposes" (approved scope), requested unconditionally on every connect. */
export const ALL_HEALTH_SCOPES: string[] = HEALTH_SCOPE_CATEGORIES.map(fullScope)

export const GOOGLE_HEALTH_PROVIDER = 'google_health'

// ---------------------------------------------------------------------
// Data type registry
// ---------------------------------------------------------------------

/** A row the sync function hands to `upsert_health_metrics`. */
export interface HealthMetricRow {
  user_id: string
  connection_id: string
  data_type: string
  recorded_at: string
  end_at: string | null
  /** JSON-stringified — `internal.encrypt_health_value` encrypts the text form. */
  value: string
  unit: string | null
  source: string | null
  raw_response: string | null
  external_id: string
}

interface RollupDataType {
  kind: 'rollup'
  /** The field name Google's `DailyRollupDataPoint` response uses for this type. */
  rollupField: string
  /** Pulls the display value + unit out of that field's rollup object. */
  extractValue: (rollupValue: Record<string, unknown>) => { value: number; unit: string } | null
}

interface ListDataType {
  kind: 'list'
  /** AIP-160 filter expression for the `dataPoints.list` call's bounded window — the exact syntax verified from the client's own doc comments (data types vary: session vs. sample vs. ECG-specific). */
  buildFilter: (startIso: string, endIso: string) => string
  /** Pulls {recordedAt, endAt, value, unit} out of one `DataPoint`'s nested `{camelCaseField}` object. Returns null to skip a point this parser can't make sense of. */
  parse: (dataPoint: Record<string, unknown>) => {
    recordedAt: string
    endAt: string | null
    value: number | Record<string, unknown>
    unit: string | null
  } | null
}

export interface DataTypeConfig {
  /** Kebab-case Google Health data type id — also this app's `health_metrics.data_type`. */
  id: string
  label: string
  scope: HealthScopeCategory
  spec: RollupDataType | ListDataType
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

/**
 * Google's `Duration`-shaped strings ("1800s") — seen on `Exercise.activeDuration`. Returns minutes.
 */
function durationSecondsStringToMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const match = /^(-?\d+(?:\.\d+)?)s$/.exec(v.trim())
  if (!match) return null
  return Number(match[1]) / 60
}

/**
 * The initial, verified set — one representative data type per scope where
 * a confident field mapping and filter syntax could be pinned down from the
 * client source this session (see the agent's report: several more data
 * types are visible in the schema — `active-minutes`, `body-fat`,
 * `blood-glucose`, `symptoms`, `menstrual-period`, `moods`,
 * `irregular-rhythm-notification`, the `daily-*` summary types, etc. — but
 * are deliberately left out of this registry rather than guessed at, since
 * getting a filter category or unit wrong would silently corrupt synced
 * data). Adding one is exactly one entry here; `runHealthSync.ts`'s loop is
 * generic over this list, it needs no changes.
 */
export const DATA_TYPES: DataTypeConfig[] = [
  {
    id: 'steps',
    label: 'Steps',
    scope: 'activity_and_fitness',
    spec: {
      kind: 'rollup',
      rollupField: 'steps',
      extractValue: (v) => {
        const value = num(v.countSum)
        return value === null ? null : { value, unit: 'steps' }
      },
    },
  },
  {
    id: 'distance',
    label: 'Distance',
    scope: 'activity_and_fitness',
    spec: {
      kind: 'rollup',
      rollupField: 'distance',
      extractValue: (v) => {
        const mm = num(v.millimetersSum)
        return mm === null ? null : { value: mm, unit: 'mm' }
      },
    },
  },
  {
    id: 'floors',
    label: 'Floors climbed',
    scope: 'activity_and_fitness',
    spec: {
      kind: 'rollup',
      rollupField: 'floors',
      extractValue: (v) => {
        const value = num(v.countSum)
        return value === null ? null : { value, unit: 'floors' }
      },
    },
  },
  {
    id: 'altitude',
    label: 'Altitude gain',
    scope: 'activity_and_fitness',
    spec: {
      kind: 'rollup',
      rollupField: 'altitude',
      extractValue: (v) => {
        const mm = num(v.gainMillimetersSum)
        return mm === null ? null : { value: mm, unit: 'mm' }
      },
    },
  },
  {
    id: 'exercise',
    label: 'Exercise sessions',
    scope: 'activity_and_fitness',
    spec: {
      kind: 'list',
      // Verified pattern: "Session civil start time (Excluding Sleep and ECG)".
      buildFilter: (startIso, endIso) =>
        `exercise.interval.civil_start_time >= "${toCivilDateTime(startIso)}" AND exercise.interval.civil_start_time < "${toCivilDateTime(endIso)}"`,
      parse: (dp) => {
        const exercise = dp.exercise as Record<string, unknown> | undefined
        if (!exercise) return null
        const interval = exercise.interval as Record<string, unknown> | undefined
        const startTime = interval?.startTime as string | undefined
        if (!startTime) return null
        const metricsSummary = exercise.metricsSummary as Record<string, unknown> | undefined
        const minutes =
          durationSecondsStringToMinutes(exercise.activeDuration) ??
          durationSecondsStringToMinutes(metricsSummary?.activeDuration)
        return {
          recordedAt: startTime,
          endAt: (interval?.endTime as string | undefined) ?? null,
          value:
            minutes !== null
              ? minutes
              : {
                  exerciseType: exercise.exerciseType ?? null,
                  caloriesKcal: metricsSummary?.caloriesKcal ?? null,
                },
          unit: minutes !== null ? 'min' : null,
        }
      },
    },
  },
  {
    id: 'heart-rate',
    label: 'Heart rate',
    scope: 'health_metrics_and_measurements',
    spec: {
      kind: 'rollup',
      rollupField: 'heartRate',
      extractValue: (v) => {
        const value = num(v.beatsPerMinuteAvg)
        return value === null ? null : { value, unit: 'bpm' }
      },
    },
  },
  {
    id: 'weight',
    label: 'Weight',
    scope: 'health_metrics_and_measurements',
    spec: {
      kind: 'rollup',
      rollupField: 'weight',
      extractValue: (v) => {
        const value = num(v.weightGramsAvg)
        return value === null ? null : { value, unit: 'g' }
      },
    },
  },
  {
    id: 'sleep',
    label: 'Sleep',
    scope: 'sleep',
    spec: {
      kind: 'list',
      // Verified pattern: "Session end time (Sleep specific)".
      buildFilter: (startIso, endIso) =>
        `sleep.interval.end_time >= "${startIso}" AND sleep.interval.end_time < "${endIso}"`,
      parse: (dp) => {
        const sleep = dp.sleep as Record<string, unknown> | undefined
        if (!sleep) return null
        const interval = sleep.interval as Record<string, unknown> | undefined
        const startTime = interval?.startTime as string | undefined
        if (!startTime) return null
        const summary = sleep.summary as Record<string, unknown> | undefined
        const minutesAsleep = num(summary?.minutesAsleep)
        return {
          recordedAt: startTime,
          endAt: (interval?.endTime as string | undefined) ?? null,
          value: minutesAsleep !== null ? minutesAsleep : { summary: summary ?? null },
          unit: minutesAsleep !== null ? 'min' : null,
        }
      },
    },
  },
  {
    id: 'electrocardiogram',
    label: 'ECG',
    scope: 'ecg',
    spec: {
      kind: 'list',
      // Verified pattern: "Session start time (ECG specific)" — ONLY >=
      // is supported for this data type; there is no upper-bound filter.
      buildFilter: (startIso) => `electrocardiogram.interval.start_time >= "${startIso}"`,
      parse: (dp) => {
        const ecg = dp.electrocardiogram as Record<string, unknown> | undefined
        if (!ecg) return null
        const interval = ecg.interval as Record<string, unknown> | undefined
        // Per the client's own doc comment, start_time === end_time for ECG
        // (it's a reading instant, not a real span).
        const startTime = interval?.startTime as string | undefined
        if (!startTime) return null
        const bpm = num(ecg.beatsPerMinuteAvg)
        return {
          recordedAt: startTime,
          endAt: null,
          value: bpm !== null ? bpm : { resultClassification: ecg.resultClassification ?? null },
          unit: bpm !== null ? 'bpm' : null,
        }
      },
    },
  },
]

/** `YYYY-MM-DDTHH:mm:ss` (no trailing `Z`) — the civil-time literal format `interval.civil_start_time` filters expect. */
function toCivilDateTime(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, '').replace(/Z$/, '')
}

/** `{year, month, day}` for the `dailyRollUp` request's `CivilDateTime.date`. */
export function toCivilDate(iso: string): { year: number; month: number; day: number } {
  const d = new Date(iso)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}
