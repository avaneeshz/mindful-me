import { supabase } from '@/lib/supabaseClient'
import type { Holiday, ImportantDay } from '@/domain/importantDays'

/** India holidays/festivals for one year, via the `india-holidays` edge function. `null` on any failure. */
export async function apiListIndiaHolidays(year: number): Promise<Holiday[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('india-holidays', { body: { year } })
  if (error || !Array.isArray(data?.holidays)) {
    // eslint-disable-next-line no-console
    console.warn('[calendar] india-holidays failed', error?.message)
    return null
  }
  return data.holidays as Holiday[]
}

interface ImportantDayRow {
  id: string
  name: string
  month: number
  day: number
}

export async function apiListImportantDays(): Promise<ImportantDay[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('important_days').select('id, name, month, day').order('month').order('day')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[calendar] list important_days failed', error.message)
    return null
  }
  return (data ?? []) as ImportantDayRow[]
}

export async function apiCreateImportantDay(day: ImportantDay): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('create_important_day', {
    p_id: day.id,
    p_name: day.name,
    p_month: day.month,
    p_day: day.day,
  })
  return !error || error.code === '23505'
}

export async function apiUpdateImportantDay(day: ImportantDay): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('update_important_day', {
    p_id: day.id,
    p_name: day.name,
    p_month: day.month,
    p_day: day.day,
  })
  return !error
}

export async function apiDeleteImportantDay(id: string): Promise<boolean> {
  if (!supabase) return false
  // RLS limits this to the caller's own rows.
  const { error } = await supabase.from('important_days').delete().eq('id', id)
  return !error
}
