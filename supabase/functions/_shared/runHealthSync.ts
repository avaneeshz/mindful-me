import {
  ALL_HEALTH_SCOPES,
  DATA_TYPES,
  GOOGLE_HEALTH_BASE_URL,
  GOOGLE_HEALTH_PROVIDER,
  GOOGLE_OAUTH_TOKEN_ENDPOINT,
  fullScope,
  toCivilDate,
  type DataTypeConfig,
  type HealthMetricRow,
} from './googleHealth.ts'
import {
  aggregateDaily,
  alignToLocalDays,
  asNumber,
  buildFilter,
  pointTimes,
  reduceHeartRateDay,
} from './healthTypes.ts'
import { recentLocalDays, safeTimeZone } from './timeZone.ts'

/** A day's trailing window every sync run refreshes, regardless of backfill progress — keeps "recent" data current even once the backfill frontier has walked far into the past. */
const RECENT_WINDOW_DAYS = 3
/** How far back one sync call is willing to walk the backfill frontier in a single run per data type — bounded (rule 8's spirit, and the brief's explicit "page/chunk it, never one call"). 14 days matches Google's own strictest rollup range limit (heart-rate, active-minutes, total-calories, calories-in-heart-rate-zone), so it's safe to use uniformly even though a couple of the included types allow up to 90. */
const BACKFILL_CHUNK_DAYS = 14
/** Backfill stops once the frontier reaches this far into the past — a full year of history is plenty for a life-tracking dashboard; nothing stops a later change from going deeper. */
const MAX_BACKFILL_DAYS = 365
/** Refresh the access token if it expires within this long — avoids a race against a token that's valid when checked but expired by the time the request lands. */
const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000
/** Hard cap on `dataPoints.list` pagination loops per data type per run — bounded (rule 8), never an unbounded "keep paging until done" loop. */
const MAX_LIST_PAGES = 5

interface SyncResult {
  ok: boolean
  reason?: 'not_connected' | 'reauth_required' | 'sync_error'
  message?: string
  pointsSynced?: number
  /** The step to call next, or `null` once this sync is complete. */
  nextStep?: number | null
  totalSteps?: number
  /** Which kind of sync ran — continuation calls must send this back as their mode. */
  mode?: 'full' | 'quick'
}

/**
 * `full` walks every granted type plus history (first sync, Sync now).
 * `quick` refreshes only what moves during a day, for automatic syncs.
 * `auto` lets the server choose: full when the last full sync is older than
 * `FULL_SYNC_EVERY_MS` (so late uploads and history still arrive), else quick.
 */
export type SyncMode = 'full' | 'quick' | 'auto'

/** How often an automatic sync is promoted to a full one. */
const FULL_SYNC_EVERY_MS = 6 * 60 * 60 * 1000

/** The types a quick sync refreshes (plus today's per-minute heart rate) — the ones that change minute to minute. */
const QUICK_TYPE_IDS = new Set(['steps', 'heart-rate', 'active-energy-burned'])

/** How many local days of per-minute heart rate a sync keeps fresh, from the registry. */
const HEART_RATE_DAYS = (() => {
  const spec = DATA_TYPES.find((dt) => dt.spec.kind === 'intraday-hr')?.spec
  return spec?.kind === 'intraday-hr' ? spec.days : 14
})()

/** A quick sync is a handful of small reads, so it runs in one call. */
const QUICK_BUDGET = 12

/**
 * A function call gets roughly 2 seconds of CPU. Doing a whole sync in one
 * call (40-odd data types, two weeks of per-minute heart rate) blew that, so a
 * sync is a fixed list of tasks run a few per call: each call spends at most
 * `STEP_BUDGET` cost units, then returns where the next call should resume.
 */
const STEP_BUDGET = 6


interface GoogleErrorBody {
  error?: string
  error_description?: string
}

async function googleFetch(accessToken: string, url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const message = body?.error?.message ?? `Google Health API request failed (${res.status})`
    throw new Error(message)
  }
  return body
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: string; refreshToken: string | null }> {
  const res = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    const err = body as GoogleErrorBody
    throw new Error(err.error_description ?? err.error ?? `token refresh failed (${res.status})`)
  }
  const expiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString()
  // Google usually omits refresh_token on a plain refresh — only the first
  // consent grant is guaranteed to include one. `upsert_external_connection`
  // treats a null refresh token as "keep the existing one" (see its SQL).
  return { accessToken: body.access_token, expiresAt, refreshToken: body.refresh_token ?? null }
}

async function fetchRollupRows(
  accessToken: string,
  dt: DataTypeConfig,
  windowStart: Date,
  windowEnd: Date,
): Promise<Array<{ recordedAt: string; endAt: string | null; value: number; unit: string }>> {
  if (dt.spec.kind !== 'rollup') return []
  const url = `${GOOGLE_HEALTH_BASE_URL}users/me/dataTypes/${dt.id}/dataPoints:dailyRollUp`
  const body = {
    range: {
      start: { date: toCivilDate(windowStart.toISOString()) },
      end: { date: toCivilDate(windowEnd.toISOString()) },
    },
    windowSizeDays: 1,
  }
  const res = await googleFetch(accessToken, url, { method: 'POST', body: JSON.stringify(body) })
  const rollups: Array<Record<string, unknown>> = res.rollupDataPoints ?? []
  const rows: Array<{ recordedAt: string; endAt: string | null; value: number; unit: string }> = []
  for (const r of rollups) {
    const fieldValue = r[dt.spec.rollupField] as Record<string, unknown> | undefined
    if (!fieldValue) continue
    const extracted = dt.spec.extractValue(fieldValue)
    if (!extracted) continue
    const start = r.civilStartTime as Record<string, unknown> | undefined
    const end = r.civilEndTime as Record<string, unknown> | undefined
    const startDate = start?.date as Record<string, number> | undefined
    if (!startDate) continue
    const recordedAt = new Date(Date.UTC(startDate.year, (startDate.month ?? 1) - 1, startDate.day ?? 1)).toISOString()
    const endDate = end?.date as Record<string, number> | undefined
    const endAt = endDate
      ? new Date(Date.UTC(endDate.year, (endDate.month ?? 1) - 1, endDate.day ?? 1)).toISOString()
      : null
    rows.push({ recordedAt, endAt, value: extracted.value, unit: extracted.unit })
  }
  return rows
}

async function fetchListRows(
  accessToken: string,
  dt: DataTypeConfig,
  windowStart: Date,
  windowEnd: Date,
): Promise<
  Array<{ recordedAt: string; endAt: string | null; value: number | Record<string, unknown>; unit: string | null }>
> {
  if (dt.spec.kind !== 'list') return []
  const filter = dt.spec.buildFilter(windowStart.toISOString(), windowEnd.toISOString())
  const rows: Array<{
    recordedAt: string
    endAt: string | null
    value: number | Record<string, unknown>
    unit: string | null
  }> = []
  let pageToken: string | undefined
  const spec = dt.spec
  for (let page = 0; page < (spec.maxPages ?? MAX_LIST_PAGES); page++) {
    const params = new URLSearchParams({ filter, pageSize: String(spec.pageSize ?? 100) })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `${GOOGLE_HEALTH_BASE_URL}users/me/dataTypes/${dt.id}/dataPoints?${params.toString()}`
    const res = await googleFetch(accessToken, url)
    const dataPoints: Array<Record<string, unknown>> = res.dataPoints ?? []
    for (const dp of dataPoints) {
      const parsed = spec.parse(dp)
      if (!parsed) continue
      // Only the parsed point is kept — the full `dp` (an ECG carries its whole
      // waveform) is dropped as soon as this loop moves on.
      rows.push(parsed)
    }
    pageToken = res.nextPageToken || undefined
    if (!pageToken) break
  }
  return rows
}

type SeriesPoint = {
  recordedAt: string
  endAt: string | null
  value: unknown
  unit: string | null
}

/** A page of up to 10,000 points — Google's documented maximum, and enough for a whole day of heart rate. */
const GENERIC_PAGE_SIZE = '10000'

/**
 * Fetches a `generic` data type over a window. `raw` types come back one row
 * per point (the inner object as the API sent it); `daily` types are rolled
 * into one row per local day, with the window widened to whole local days so a
 * day's total is never built from part of that day.
 */
async function fetchGenericRows(
  accessToken: string,
  dt: DataTypeConfig,
  windowStart: Date,
  windowEnd: Date,
  tz: string,
): Promise<SeriesPoint[]> {
  if (dt.spec.kind !== 'generic') return []
  const spec = dt.spec
  let startMs = windowStart.getTime()
  let endMs = windowEnd.getTime()
  if (spec.mode === 'daily') ({ startMs, endMs } = alignToLocalDays(startMs, endMs, tz))
  const filter = buildFilter(spec.filter, spec.field, new Date(startMs).toISOString(), new Date(endMs).toISOString())

  const inners: Array<Record<string, unknown>> = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({ filter, pageSize: GENERIC_PAGE_SIZE })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await googleFetch(accessToken, `${GOOGLE_HEALTH_BASE_URL}users/me/dataTypes/${dt.id}/dataPoints?${params}`)
    for (const dp of (res.dataPoints ?? []) as Array<Record<string, unknown>>) {
      const inner = dp[spec.field] as Record<string, unknown> | undefined
      if (inner) inners.push(inner)
    }
    pageToken = res.nextPageToken || undefined
    if (!pageToken) break
  }

  if (spec.mode === 'raw') {
    const out: SeriesPoint[] = []
    for (const inner of inners) {
      const t = pointTimes(spec.filter, inner)
      if (t) out.push({ ...t, value: inner, unit: null })
    }
    return out
  }

  const timed = inners.flatMap((inner) => {
    const t = pointTimes('interval', inner)
    return t ? [{ startMs: new Date(t.recordedAt).getTime(), endMs: t.endAt ? new Date(t.endAt).getTime() : null, inner }] : []
  })
  return aggregateDaily(timed, spec.sumPath, tz).map((row) => ({ ...row, unit: null }))
}

/** `users/me/profile` or `users/me/settings` — `null` on any failure, never fatal. */
async function fetchAccountDoc(accessToken: string, path: 'profile' | 'settings'): Promise<Record<string, unknown> | null> {
  try {
    return (await googleFetch(accessToken, `${GOOGLE_HEALTH_BASE_URL}users/me/${path}`)) as Record<string, unknown>
  } catch (err) {
    console.warn(`[health-sync] ${path} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Heart rate for one local day: every reading Google has, reduced to one per
 * minute. Returns `null` for a day with no readings so nothing empty is stored.
 */
async function fetchHeartRateDay(accessToken: string, dayStartMs: number, dayEndMs: number) {
  const filter = buildFilter('sample', 'heartRate', new Date(dayStartMs).toISOString(), new Date(dayEndMs).toISOString())
  const samples: Array<{ tMs: number; bpm: number }> = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({ filter, pageSize: GENERIC_PAGE_SIZE })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await googleFetch(accessToken, `${GOOGLE_HEALTH_BASE_URL}users/me/dataTypes/heart-rate/dataPoints?${params}`)
    for (const dp of (res.dataPoints ?? []) as Array<Record<string, unknown>>) {
      const hr = dp.heartRate as Record<string, unknown> | undefined
      const at = (hr?.sampleTime as Record<string, unknown> | undefined)?.physicalTime
      const bpm = asNumber(hr?.beatsPerMinute)
      if (typeof at === 'string' && bpm !== null) samples.push({ tMs: new Date(at).getTime(), bpm })
    }
    pageToken = res.nextPageToken || undefined
    if (!pageToken) break
  }
  return reduceHeartRateDay(samples, dayStartMs, dayEndMs)
}

/**
 * Pulls fresh data for every data type the connection's granted scopes
 * cover, upserts it, and records progress. Safe to call repeatedly — each
 * call only ever touches a bounded recent window plus one more
 * `BACKFILL_CHUNK_DAYS`-sized step of history per data type (rule 8; the
 * brief's "page/chunk it, let repeat syncs fill in more history over
 * time").
 */
export async function runHealthSync(
  admin: ReturnType<typeof import('./supabaseClients.ts').serviceRoleClient>,
  userId: string,
  clientId: string,
  clientSecret: string,
  provider: string = GOOGLE_HEALTH_PROVIDER,
  step = 0,
  mode: SyncMode = 'full',
): Promise<SyncResult> {
  const { data: connections, error: connError } = await admin.rpc('get_external_connection_for_sync', {
    p_user_id: userId,
    p_provider: provider,
  })
  if (connError) return { ok: false, reason: 'sync_error', message: connError.message }
  const connection = connections?.[0]
  if (!connection) return { ok: false, reason: 'not_connected' }

  let accessToken: string = connection.access_token
  const expiresAt = new Date(connection.expires_at).getTime()

  if (expiresAt - Date.now() < TOKEN_REFRESH_SKEW_MS) {
    if (!connection.refresh_token) {
      await admin.rpc('mark_external_connection_synced', {
        p_id: connection.id,
        p_status: 'needs_reauth',
        p_last_error: 'Access token expired and no refresh token is stored.',
      })
      return { ok: false, reason: 'reauth_required', message: 'No refresh token stored.' }
    }
    try {
      const refreshed = await refreshAccessToken(connection.refresh_token, clientId, clientSecret)
      accessToken = refreshed.accessToken
      // NOT `upsert_external_connection` — that clears `deleted_at`
      // unconditionally, which is correct for a fresh OAuth consent
      // (health-sync-oauth-callback) but would silently resurrect a
      // connection that was disconnected while this refresh was in
      // flight. `update_external_connection_access_token` never touches
      // `deleted_at` and is itself scoped `where ... deleted_at is null`,
      // so it becomes a no-op (returns false) instead, and this run stops
      // rather than proceeding on a token for a connection that may no
      // longer exist from the user's point of view.
      const { data: refreshApplied, error: refreshWriteError } = await admin.rpc(
        'update_external_connection_access_token',
        {
          p_id: connection.id,
          p_access_token: refreshed.accessToken,
          p_expires_at: refreshed.expiresAt,
          p_refresh_token: refreshed.refreshToken,
        },
      )
      if (refreshWriteError) {
        return { ok: false, reason: 'sync_error', message: refreshWriteError.message }
      }
      if (!refreshApplied) {
        return { ok: false, reason: 'not_connected' }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token refresh failed'
      await admin.rpc('mark_external_connection_synced', {
        p_id: connection.id,
        p_status: 'needs_reauth',
        p_last_error: message,
      })
      return { ok: false, reason: 'reauth_required', message }
    }
  }

  const grantedScopes = new Set<string>(connection.scopes ?? [])
  const grantedDataTypes = DATA_TYPES.filter((dt) => grantedScopes.has(fullScope(dt.scope)))
  // Never widen the request beyond `connection.scopes`.
  void ALL_HEALTH_SCOPES

  const now = new Date()
  const recentWindowStart = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  // Read fresh on every step, so each step sees what earlier steps recorded.
  // deno-lint-ignore no-explicit-any
  const syncState: Record<string, any> = { ...(connection.sync_state ?? {}) }
  const rows: HealthMetricRow[] = []

  const lastFullMs = Date.parse(syncState.__lastFullSyncAt ?? '')
  const resolved: 'full' | 'quick' =
    mode === 'auto' ? (Number.isFinite(lastFullMs) && now.getTime() - lastFullMs < FULL_SYNC_EVERY_MS ? 'quick' : 'full') : mode

  function pushRow(dt: DataTypeConfig, point: { recordedAt: string; endAt: string | null; value: unknown; unit: string | null }) {
    rows.push({
      user_id: userId,
      connection_id: connection.id,
      data_type: dt.id,
      recorded_at: point.recordedAt,
      end_at: point.endAt,
      value: JSON.stringify(point.value),
      unit: point.unit,
      source: null,
      // Nothing reads the raw response, and for ECG it is a whole waveform.
      raw_response: null,
      external_id: `${dt.id}:${point.recordedAt}:${point.endAt ?? ''}`,
    })
  }

  // The person's time zone decides where their days start. Settings is one
  // small request; it is re-read each step rather than trusted from state.
  const settingsDoc = grantedScopes.has(fullScope('settings')) ? await fetchAccountDoc(accessToken, 'settings') : null
  const tz = safeTimeZone(typeof settingsDoc?.timeZone === 'string' ? settingsDoc.timeZone : null)
  const localDays = recentLocalDays(now.getTime(), HEART_RATE_DAYS, tz)
  const todayStart = new Date(localDays[localDays.length - 1].startMs).toISOString()

  const maxBackfillDays = (dt: DataTypeConfig) => (dt.spec.kind === 'generic' ? dt.spec.maxBackfillDays : MAX_BACKFILL_DAYS)

  async function fetchSeries(dt: DataTypeConfig, start: Date, end: Date): Promise<SeriesPoint[]> {
    if (dt.spec.kind === 'rollup') return await fetchRollupRows(accessToken, dt, start, end)
    if (dt.spec.kind === 'list') return await fetchListRows(accessToken, dt, start, end)
    if (dt.spec.kind === 'generic') return await fetchGenericRows(accessToken, dt, start, end, tz)
    return []
  }

  async function syncSeries(dt: DataTypeConfig) {
    if (dt.spec.kind === 'list' && dt.spec.unboundedEnd) {
      // This type's filter has only a lower bound, so no frontier is kept:
      // each sync re-reads the whole (short) window; the upsert de-duplicates.
      const days = dt.spec.windowDays ?? MAX_BACKFILL_DAYS
      const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      for (const point of await fetchListRows(accessToken, dt, windowStart, now)) pushRow(dt, point)
      delete syncState[dt.id]
      return
    }

    // The recent trailing window — always refreshed.
    for (const point of await fetchSeries(dt, recentWindowStart, now)) pushRow(dt, point)

    // One more chunk of history, until backfill is complete.
    const state = syncState[dt.id] ?? { frontier: recentWindowStart.toISOString(), backfillComplete: false }
    if (state.backfillComplete) return
    const frontier = new Date(state.frontier)
    const cap = new Date(now.getTime() - maxBackfillDays(dt) * 24 * 60 * 60 * 1000)
    let chunkStart = new Date(frontier.getTime() - BACKFILL_CHUNK_DAYS * 24 * 60 * 60 * 1000)
    let backfillComplete = false
    if (chunkStart <= cap) {
      chunkStart = cap
      backfillComplete = true
    }
    if (chunkStart < frontier) {
      for (const point of await fetchSeries(dt, chunkStart, frontier)) pushRow(dt, point)
    }
    syncState[dt.id] = { frontier: chunkStart.toISOString(), backfillComplete }
  }

  // ---------------------------------------------------------------------
  // The task list. It depends only on the granted scopes and today's date,
  // so every step of one sync sees the same list and `step` is a stable
  // index into it. A task that has nothing to do costs nothing.
  // ---------------------------------------------------------------------
  interface Task {
    label: string
    cost: number
    run: () => Promise<void>
  }
  const tasks: Task[] = []

  if (resolved === 'quick') {
    // Since the start of yesterday: covers a late upload of last night's
    // sleep or late-evening steps, and nothing older.
    const quickStart = new Date(localDays[localDays.length - 2].startMs)
    for (const dt of grantedDataTypes) {
      if (!QUICK_TYPE_IDS.has(dt.id)) continue
      const cost = dt.spec.kind === 'rollup' ? 1 : dt.spec.kind === 'list' ? 2 : 3
      tasks.push({
        label: `quick ${dt.id}`,
        cost,
        run: async () => {
          for (const point of await fetchSeries(dt, quickStart, now)) pushRow(dt, point)
        },
      })
    }
    const hrType = grantedDataTypes.find((dt) => dt.spec.kind === 'intraday-hr')
    const today = localDays[localDays.length - 1]
    if (hrType) {
      tasks.push({
        label: `quick heart-rate ${today.key}`,
        cost: 3,
        run: async () => {
          const reduced = await fetchHeartRateDay(accessToken, today.startMs, today.endMs)
          if (reduced) {
            pushRow(hrType, {
              recordedAt: new Date(today.startMs).toISOString(),
              endAt: new Date(today.endMs).toISOString(),
              value: reduced,
              unit: 'bpm',
            })
          }
        },
      })
    }
  } else {
    const accountTypes = grantedDataTypes.filter((dt) => dt.spec.kind === 'account')
    if (accountTypes.length > 0) {
      tasks.push({
        label: 'account',
        cost: 1,
        run: async () => {
          for (const dt of accountTypes) {
            if (dt.spec.kind !== 'account') continue
            const doc = dt.spec.path === 'settings' ? settingsDoc : await fetchAccountDoc(accessToken, dt.spec.path)
            // One snapshot row per local day: a repeat sync the same day updates it.
            if (doc) pushRow(dt, { recordedAt: todayStart, endAt: null, value: doc, unit: null })
          }
        },
      })
    }

    // Heart rate through the day: one task per local day. Today and yesterday
    // are always refreshed (a watch can upload late) and run right after the
    // account snapshot, so the day on screen is fresh even if a long sync is
    // cut short. Past days follow everything else, newest first; one fetched in
    // full is recorded in state and skipped from then on.
    const hrType = grantedDataTypes.find((dt) => dt.spec.kind === 'intraday-hr')
    const pastHeartRate: Task[] = []
    if (hrType) {
      const doneDays = new Set<string>(Array.isArray(syncState['heart-rate-intraday']?.doneDays) ? syncState['heart-rate-intraday'].doneDays : [])
      const refreshAlways = new Set(localDays.slice(-2).map((d) => d.key))
      for (const day of [...localDays].reverse()) {
        const skip = doneDays.has(day.key) && !refreshAlways.has(day.key)
        const task: Task = {
          label: `heart-rate ${day.key}`,
          cost: skip ? 0 : 3,
          run: async () => {
            if (skip) return
            const reduced = await fetchHeartRateDay(accessToken, day.startMs, day.endMs)
            if (reduced) {
              pushRow(hrType, {
                recordedAt: new Date(day.startMs).toISOString(),
                endAt: new Date(day.endMs).toISOString(),
                value: reduced,
                unit: 'bpm',
              })
            }
            if (!refreshAlways.has(day.key)) {
              doneDays.add(day.key)
              // Only the days a sync covers need remembering.
              const keep = new Set(localDays.map((d) => d.key))
              syncState['heart-rate-intraday'] = { doneDays: [...doneDays].filter((k) => keep.has(k)) }
            }
          },
        }
        if (refreshAlways.has(day.key)) tasks.push(task)
        else pastHeartRate.push(task)
      }
    }

    for (const dt of grantedDataTypes) {
      const spec = dt.spec
      if (spec.kind === 'rollup') tasks.push({ label: dt.id, cost: 1, run: () => syncSeries(dt) })
      // ECG waveforms and per-minute types are the heavy ones: each gets a call to itself.
      else if (spec.kind === 'list') tasks.push({ label: dt.id, cost: spec.unboundedEnd ? STEP_BUDGET : 2, run: () => syncSeries(dt) })
      else if (spec.kind === 'generic') tasks.push({ label: dt.id, cost: spec.mode === 'daily' ? STEP_BUDGET : 1, run: () => syncSeries(dt) })
    }
    tasks.push(...pastHeartRate)
  }

  // Run tasks from `step` until this call's budget is spent (always at least one).
  const budget = resolved === 'quick' ? QUICK_BUDGET : STEP_BUDGET
  let i = Math.max(0, Math.min(step, tasks.length))
  let spent = 0
  while (i < tasks.length) {
    const task = tasks[i]
    if (spent > 0 && spent + task.cost > budget) break
    try {
      await task.run()
    } catch (err) {
      // One task failing (a transient Google error, a type this account has
      // no data for) never aborts the sync — the rest still get their turn.
      console.warn(`[health-sync] ${task.label} failed:`, err instanceof Error ? err.message : err)
    }
    spent += task.cost
    i++
  }
  const nextStep = i < tasks.length ? i : null
  // A finished full sync resets the clock for `auto`'s next promotion.
  if (resolved === 'full' && nextStep === null) syncState.__lastFullSyncAt = now.toISOString()

  // One statement can't update the same row twice, and overlapping windows
  // can produce the same external id — keep the last of each.
  const uniqueRows = [...new Map(rows.map((r) => [`${r.data_type}|${r.external_id}`, r])).values()]

  if (uniqueRows.length > 0) {
    const { error: upsertError } = await admin.rpc('upsert_health_metrics', { p_rows: uniqueRows })
    if (upsertError) {
      await admin.rpc('mark_external_connection_synced', {
        p_id: connection.id,
        p_status: 'error',
        p_last_error: upsertError.message,
      })
      return { ok: false, reason: 'sync_error', message: upsertError.message }
    }
  }

  await admin.rpc('mark_external_connection_synced', {
    p_id: connection.id,
    p_status: 'connected',
    p_last_error: null,
    p_sync_state: syncState,
  })

  return { ok: true, pointsSynced: uniqueRows.length, nextStep, totalSteps: tasks.length, mode: resolved }
}
