import { supabase } from '@/lib/supabaseClient'
import type { CustomIcon } from '@/domain/customIcons'

interface CustomIconRow {
  id: string
  image_data: string
}

/** This user's uploaded icons, oldest first. `null` (never `[]`) when the server couldn't be read. */
export async function apiListCustomIcons(): Promise<CustomIcon[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('custom_icons').select('id, image_data').order('created_at')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[customIcons] list failed', error.message)
    return null
  }
  return ((data ?? []) as CustomIconRow[]).map((row) => ({ id: row.id, imageData: row.image_data }))
}

export type CreateCustomIconResult = { ok: true } | { ok: false; reason: 'limit_reached' | 'invalid' | 'unreachable' }

/** `id` is client-supplied; a retry that hits the existing row counts as success. */
export async function apiCreateCustomIcon(id: string, imageData: string): Promise<CreateCustomIconResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('create_custom_icon', { p_id: id, p_image_data: imageData })
  if (!error) return { ok: true }
  if (error.code === '23505') return { ok: true }
  if (error.message.includes('icon_limit_reached')) return { ok: false, reason: 'limit_reached' }
  if (error.message.includes('invalid_icon_format') || error.message.includes('icon_too_large')) {
    return { ok: false, reason: 'invalid' }
  }
  return { ok: false, reason: 'unreachable' }
}

export type DeleteCustomIconResult = { ok: true } | { ok: false; reason: 'in_use' | 'unreachable' }

export async function apiDeleteCustomIcon(id: string): Promise<DeleteCustomIconResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  // RLS limits this to the caller's own icons; a trigger refuses one still in use.
  const { error } = await supabase.from('custom_icons').delete().eq('id', id)
  if (!error) return { ok: true }
  if (error.message.includes('icon_in_use')) return { ok: false, reason: 'in_use' }
  return { ok: false, reason: 'unreachable' }
}
