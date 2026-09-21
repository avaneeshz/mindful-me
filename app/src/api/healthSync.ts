import { supabase } from '@/lib/supabaseClient'

/** Only provider this app talks to today — kept as a constant (not hardcoded inline) exactly because the schema itself doesn't assume there's only ever one. */
export const GOOGLE_HEALTH_PROVIDER = 'google_health'

export interface HealthConnectionStatus {
  status: 'connected' | 'needs_reauth' | 'error'
  scopes: string[]
  expiresAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  createdAt: string
}

export interface HealthDataTypeSummary {
  dataType: string
  latestRecordedAt: string | null
  pointCountRecent: number
}

export interface HealthMetricPoint {
  id: string
  dataType: string
  recordedAt: string
  endAt: string | null
  /** Already `JSON.parse`d — see `upsert_health_metrics`/`list_health_metrics` in the health_sync migration for why it's stored as JSON text. A point this client can't parse is dropped rather than surfaced broken. */
  value: number | Record<string, unknown>
  unit: string | null
  source: string | null
}

/** Zero or one row: `null` means "never connected" (never "failed to check" — see the try/catch below, which also collapses to `null` on a network failure, same contract `apiListScheduledActivities` uses elsewhere in this codebase). */
export async function apiGetHealthConnectionStatus(): Promise<HealthConnectionStatus | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_health_connection_status', { p_provider: GOOGLE_HEALTH_PROVIDER })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[health-sync] get_health_connection_status failed', error.message)
    return null
  }
  const row = data?.[0]
  if (!row) return null
  return {
    status: row.status,
    scopes: row.scopes ?? [],
    expiresAt: row.expires_at,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  }
}

export async function apiListHealthDataTypeSummaries(): Promise<HealthDataTypeSummary[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_health_data_type_summaries', { p_provider: GOOGLE_HEALTH_PROVIDER })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[health-sync] list_health_data_type_summaries failed', error.message)
    return null
  }
  return (data ?? []).map((row: any) => ({
    dataType: row.data_type,
    latestRecordedAt: row.latest_recorded_at,
    pointCountRecent: Number(row.point_count_recent ?? 0),
  }))
}

/** Rule 8 — always a bounded window, exactly like `apiListScheduledActivities`. */
export async function apiListHealthMetrics(
  dataType: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<HealthMetricPoint[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_health_metrics', {
    p_provider: GOOGLE_HEALTH_PROVIDER,
    p_data_type: dataType,
    p_range_start: rangeStart.toISOString(),
    p_range_end: rangeEnd.toISOString(),
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[health-sync] list_health_metrics failed', error.message)
    return null
  }
  const points: HealthMetricPoint[] = []
  for (const row of data ?? []) {
    let value: number | Record<string, unknown>
    try {
      value = JSON.parse(row.value)
    } catch {
      continue
    }
    points.push({
      id: row.id,
      dataType: row.data_type,
      recordedAt: row.recorded_at,
      endAt: row.end_at,
      value,
      unit: row.unit,
      source: row.source,
    })
  }
  return points
}

export async function apiDisconnectHealthConnection(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('disconnect_health_connection', { p_provider: GOOGLE_HEALTH_PROVIDER })
  if (error) throw error
}

export interface ExchangeOAuthCodeResult {
  ok: boolean
  error?: string
  message?: string
}

/** Calls the `health-sync-oauth-callback` Edge Function — the ONLY place the Google client secret is ever used, entirely server side. `supabase.functions.invoke` attaches the signed-in user's own access token automatically. */
export async function apiExchangeHealthOAuthCode(code: string, redirectUri: string): Promise<ExchangeOAuthCodeResult> {
  if (!supabase) return { ok: false, error: 'not_configured' }
  const { data, error } = await supabase.functions.invoke('health-sync-oauth-callback', {
    body: { code, redirectUri },
  })
  if (error) {
    return { ok: false, error: 'request_failed', message: error.message }
  }
  return data as ExchangeOAuthCodeResult
}

export interface TriggerSyncResult {
  ok: boolean
  reason?: 'not_connected' | 'reauth_required' | 'sync_error'
  message?: string
  pointsSynced?: number
}

export async function apiTriggerHealthSync(): Promise<TriggerSyncResult> {
  if (!supabase) return { ok: false, reason: 'sync_error', message: 'not_configured' }
  const { data, error } = await supabase.functions.invoke('health-sync-sync', { body: {} })
  if (error) {
    return { ok: false, reason: 'sync_error', message: error.message }
  }
  return data as TriggerSyncResult
}
