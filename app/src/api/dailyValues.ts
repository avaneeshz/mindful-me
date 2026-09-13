import { supabase } from '@/lib/supabaseClient'

/** A synced per-day metric value — see `public.daily_values` / `daily_value_dto`. */
export interface DailyValueEntry {
  metricKey: string
  localDate: string
  value: number
  updatedAt: string
}

interface DailyValueDto {
  metric_key: string
  local_date: string
  value: number
  updated_at: string
}

function dtoToClient(dto: DailyValueDto): DailyValueEntry {
  return { metricKey: dto.metric_key, localDate: dto.local_date, value: dto.value, updatedAt: dto.updated_at }
}

/**
 * "Each entry REPLACES the day's value" (Protein) — an upsert keyed on
 * (metric, day). Returns `null` on failure to reach/read the server (no
 * backend configured, or the write didn't land) rather than throwing — the
 * caller already holds the local-first copy (rule 6) and treats `null` as
 * "still saved on this device, will retry on next load", mirroring
 * `apiCreateNoteEntry`.
 */
export async function apiSetDailyValue(
  metricKey: string,
  localDate: string,
  value: number,
): Promise<DailyValueEntry | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('set_daily_value', {
    p_metric_key: metricKey,
    p_local_date: localDate,
    p_value: value,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[dailyValues] set_daily_value failed — kept locally, will retry on next load', error.message)
    return null
  }
  return dtoToClient(data as DailyValueDto)
}

/**
 * One metric's full history, newest first — rule 8's "unbounded but
 * naturally small (at most one row per calendar day)" carve-out, same as
 * `apiListNoteEntries`. Returns `null` (never `[]`) on any failure to
 * reach/read the server, so a caller can tell "genuinely nothing logged"
 * from "couldn't check".
 */
export async function apiListDailyValues(metricKey: string): Promise<DailyValueEntry[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_daily_values', { p_metric_key: metricKey })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[dailyValues] list_daily_values failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as DailyValueDto[]).map(dtoToClient)
}
