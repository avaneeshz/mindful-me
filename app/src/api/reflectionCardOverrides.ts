import { supabase } from '@/lib/supabaseClient'

export interface ReflectionCardOverrideRow {
  card: number
  name: string | null
  imageData: string | null
}

/** This user's own State Tile names and pictures. `null` (never `[]`) when the server couldn't be read. */
export async function apiListReflectionCardOverrides(): Promise<ReflectionCardOverrideRow[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('reflection_card_overrides').select('card_number, name, image_data')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[reflectionCardOverrides] list failed', error.message)
    return null
  }
  return (data ?? []).map((r: { card_number: number; name: string | null; image_data: string | null }) => ({
    card: r.card_number,
    name: r.name,
    imageData: r.image_data,
  }))
}

export type SaveCardResult = { ok: true } | { ok: false; reason: 'invalid' | 'unreachable' }

function toResult(error: { message: string } | null): SaveCardResult {
  if (!error) return { ok: true }
  const invalid = ['name_too_long', 'invalid_image_format', 'image_too_large', 'invalid_card']
  return invalid.some((code) => error.message.includes(code)) ? { ok: false, reason: 'invalid' } : { ok: false, reason: 'unreachable' }
}

/** `name` null resets to the built-in title. */
export async function apiSetReflectionCardName(card: number, name: string | null): Promise<SaveCardResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('set_reflection_card_name', { p_card: card, p_name: name })
  return toResult(error)
}

/** `imageData` null resets to the built-in illustration. */
export async function apiSetReflectionCardImage(card: number, imageData: string | null): Promise<SaveCardResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('set_reflection_card_image', { p_card: card, p_image_data: imageData })
  return toResult(error)
}

/** This user's own tile order, as stored (unchecked; `normalizeCardOrder` repairs it). `undefined` = none saved yet, `null` = couldn't be read. */
export async function apiGetReflectionCardOrder(): Promise<number[] | undefined | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('reflection_card_order').select('card_order').maybeSingle()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[reflectionCardOrder] read failed', error.message)
    return null
  }
  return (data as { card_order: number[] } | null)?.card_order
}

export async function apiSetReflectionCardOrder(order: readonly number[]): Promise<SaveCardResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('set_reflection_card_order', { p_order: [...order] })
  if (!error) return { ok: true }
  return error.message.includes('invalid_order') ? { ok: false, reason: 'invalid' } : { ok: false, reason: 'unreachable' }
}

/** This user's own custom State Tile numbers (19 and up). `null` (never `[]`) when the server couldn't be read. */
export async function apiListReflectionCustomCards(): Promise<number[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('reflection_custom_cards').select('card_number').order('card_number')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[reflectionCustomCards] list failed', error.message)
    return null
  }
  return (data ?? []).map((r: { card_number: number }) => r.card_number)
}

export type CreateCustomCardResult = { ok: true; card: number } | { ok: false; reason: 'invalid' | 'limit' | 'unreachable' }

/** Adds a tile with its name (required) and picture (optional); the server allocates its number. */
export async function apiCreateReflectionCustomCard(name: string, imageData: string | null): Promise<CreateCustomCardResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { data, error } = await supabase.rpc('create_reflection_custom_card', { p_name: name, p_image_data: imageData })
  if (!error && typeof data === 'number') return { ok: true, card: data }
  const message = error?.message ?? ''
  if (message.includes('too_many_cards')) return { ok: false, reason: 'limit' }
  const invalid = ['name_required', 'name_too_long', 'invalid_image_format', 'image_too_large']
  return invalid.some((code) => message.includes(code)) ? { ok: false, reason: 'invalid' } : { ok: false, reason: 'unreachable' }
}
