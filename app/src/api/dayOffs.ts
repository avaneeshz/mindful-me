import { supabase } from '@/lib/supabaseClient'
import type { DayOff } from '@/domain/dayOffs'

/** `public.day_off_dto` — see `20261005070000_day_offs.sql`. */
interface DayOffDto {
  local_date: string
  time_zone: string
  reason: string | null
  updated_at: string
}

function dtoToClient(dto: DayOffDto): DayOff {
  return {
    localDate: dto.local_date,
    timeZone: dto.time_zone,
    reason: dto.reason,
    updatedAt: dto.updated_at,
  }
}

/**
 * Marked days in `[from, to]` (inclusive `YYYY-MM-DD`). `null` — never `[]` —
 * when the server couldn't be reached/read, so the caller keeps its own
 * local copy rather than wiping it.
 */
export async function apiListDayOffs(from: string, to: string): Promise<DayOff[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_day_offs', {
    p_from: from,
    p_to: to,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[dayOffs] list_day_offs failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as DayOffDto[]).map(dtoToClient)
}

/** Marks a day off (or updates its reason). `null` on failure — the local-first copy stands (rule 6). */
export async function apiSetDayOff(localDate: string, timeZone: string, reason: string | null): Promise<DayOff | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('set_day_off', {
    p_local_date: localDate,
    p_time_zone: timeZone,
    p_reason: reason,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[dayOffs] set_day_off failed — kept locally', error.message)
    return null
  }
  return dtoToClient(data as DayOffDto)
}

/** Un-marks a day (server-side soft delete, rule 11). `false` when the write didn't land. */
export async function apiClearDayOff(localDate: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('clear_day_off', {
    p_local_date: localDate,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[dayOffs] clear_day_off failed — removed locally', error.message)
    return false
  }
  return true
}
