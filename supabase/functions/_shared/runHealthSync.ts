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
  dataTypesSynced?: string[]
}

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
  Array<{ recordedAt: string; endAt: string | null; value: number | Record<string, unknown>; unit: string | null; raw: unknown }>
> {
  if (dt.spec.kind !== 'list') return []
  const filter = dt.spec.buildFilter(windowStart.toISOString(), windowEnd.toISOString())
  const rows: Array<{
    recordedAt: string
    endAt: string | null
    value: number | Record<string, unknown>
    unit: string | null
    raw: unknown
  }> = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({ filter, pageSize: '100' })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `${GOOGLE_HEALTH_BASE_URL}users/me/dataTypes/${dt.id}/dataPoints?${params.toString()}`
    const res = await googleFetch(accessToken, url)
    const dataPoints: Array<Record<string, unknown>> = res.dataPoints ?? []
    for (const dp of dataPoints) {
      const parsed = dt.spec.parse(dp)
      if (!parsed) continue
      rows.push({ ...parsed, raw: dp })
    }
    pageToken = res.nextPageToken || undefined
    if (!pageToken) break
  }
  return rows
}

interface SyncStateEntry {
  frontier: string
  backfillComplete?: boolean
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
      await admin.rpc('upsert_external_connection', {
        p_user_id: userId,
        p_provider: provider,
        p_access_token: refreshed.accessToken,
        p_refresh_token: refreshed.refreshToken,
        p_expires_at: refreshed.expiresAt,
        p_scopes: connection.scopes,
        p_status: 'connected',
      })
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
  // Belt-and-braces: if somehow nothing in ALL_HEALTH_SCOPES was granted
  // (a partial consent), still only sync what was actually granted — never
  // silently widen the request beyond `connection.scopes`.
  void ALL_HEALTH_SCOPES

  const now = new Date()
  const recentWindowStart = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const syncState: Record<string, SyncStateEntry> = { ...(connection.sync_state ?? {}) }
  const rows: HealthMetricRow[] = []

  function pushRow(dt: DataTypeConfig, point: { recordedAt: string; endAt: string | null; value: unknown; unit: string | null }, raw?: unknown) {
    rows.push({
      user_id: userId,
      connection_id: connection.id,
      data_type: dt.id,
      recorded_at: point.recordedAt,
      end_at: point.endAt,
      value: JSON.stringify(point.value),
      unit: point.unit,
      source: null,
      raw_response: raw !== undefined ? JSON.stringify(raw) : null,
      external_id: `${dt.id}:${point.recordedAt}:${point.endAt ?? ''}`,
    })
  }

  for (const dt of grantedDataTypes) {
    try {
      // 1. The recent trailing window — always refreshed, keeps the
      // dashboard current regardless of how deep the backfill frontier is.
      if (dt.spec.kind === 'rollup') {
        for (const point of await fetchRollupRows(accessToken, dt, recentWindowStart, now)) pushRow(dt, point)
      } else {
        for (const point of await fetchListRows(accessToken, dt, recentWindowStart, now)) pushRow(dt, point, point.raw)
      }

      // 2. One more chunk of history, if backfill isn't done yet.
      const state = syncState[dt.id] ?? { frontier: recentWindowStart.toISOString(), backfillComplete: false }
      if (!state.backfillComplete) {
        const frontier = new Date(state.frontier)
        const cap = new Date(now.getTime() - MAX_BACKFILL_DAYS * 24 * 60 * 60 * 1000)
        let chunkStart = new Date(frontier.getTime() - BACKFILL_CHUNK_DAYS * 24 * 60 * 60 * 1000)
        let backfillComplete = false
        if (chunkStart <= cap) {
          chunkStart = cap
          backfillComplete = true
        }
        if (chunkStart < frontier) {
          if (dt.spec.kind === 'rollup') {
            for (const point of await fetchRollupRows(accessToken, dt, chunkStart, frontier)) pushRow(dt, point)
          } else {
            for (const point of await fetchListRows(accessToken, dt, chunkStart, frontier)) pushRow(dt, point, point.raw)
          }
        }
        syncState[dt.id] = { frontier: chunkStart.toISOString(), backfillComplete }
      }
    } catch (err) {
      // One data type failing (a transient Google error, a data type this
      // account has no data for yet) must never abort the whole sync run —
      // every other granted data type still gets its chance.
      // eslint-disable-next-line no-console
      console.warn(`[health-sync] ${dt.id} failed:`, err instanceof Error ? err.message : err)
    }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await admin.rpc('upsert_health_metrics', { p_rows: rows })
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

  return { ok: true, pointsSynced: rows.length, dataTypesSynced: grantedDataTypes.map((dt) => dt.id) }
}
