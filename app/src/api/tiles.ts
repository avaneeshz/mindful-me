import { supabase } from '@/lib/supabaseClient'

/** One `public.tiles` row, camelCased. */
export interface TileDto {
  id: string
  label: string
  iconKey: string
  sortOrder: number
  hidden: boolean
}

interface TileRow {
  id: string
  label: string
  icon_key: string
  sort_order: number
  hidden: boolean
}

function fromRow(row: TileRow): TileDto {
  return { id: row.id, label: row.label, iconKey: row.icon_key, sortOrder: row.sort_order, hidden: row.hidden }
}

/**
 * This user's own tiles (`public.list_tiles()`). Returns `null` (never
 * `[]`) on any failure to reach/read the server — same "genuinely nothing
 * configured vs. couldn't check" contract every other `api/*` list function
 * in this project already follows (see `apiListHeaderButtons`).
 */
export async function apiListTiles(): Promise<TileDto[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_tiles')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[tiles] list_tiles failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as TileRow[]).map(fromRow)
}

/**
 * Gives a user with zero `tiles` rows their own copy of the default 9-tile
 * set (`public.provision_default_tiles()`). Idempotent server-side — safe to
 * call speculatively. Returns `true` once the request has succeeded (the
 * caller should re-fetch after); `false` on any failure to reach the server.
 */
export async function apiProvisionDefaultTiles(): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('provision_default_tiles')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[tiles] provision_default_tiles failed', error.message)
    return false
  }
  return true
}

/** `id` is client-supplied (idempotent-retry convention this whole schema uses) so a dropped-connection retry never creates a duplicate. Returns `null` on failure to reach the server. */
export async function apiCreateTile(id: string, label: string, iconKey: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_tile', { p_id: id, p_label: label, p_icon_key: iconKey })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[tiles] create_tile failed — kept locally, will retry on next load', error.message)
    return null
  }
  return data as string
}

export async function apiUpdateTile(id: string, label: string, iconKey: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('update_tile', { p_id: id, p_label: label, p_icon_key: iconKey })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[tiles] update_tile failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

export async function apiSetTileHidden(id: string, hidden: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('set_tile_hidden', { p_id: id, p_hidden: hidden })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[tiles] set_tile_hidden failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

export async function apiReorderTiles(orderedIds: string[]): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('reorder_tiles', { p_ordered_ids: orderedIds })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[tiles] reorder_tiles failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

/**
 * Hard-deletes a tile with no real history under it. On failure, `reason`
 * tells the caller why: `'has_history'` (server-enforced — rule 11, offer
 * "hide instead"), or `'unreachable'` (couldn't reach the server at all —
 * the local optimistic delete should be rolled back, not treated as a
 * history block).
 */
export async function apiDeleteTile(id: string): Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('delete_tile', { p_id: id })
  if (error) {
    if (error.message.includes('tile_has_history_use_hide')) return { ok: false, reason: 'has_history' }
    // eslint-disable-next-line no-console
    console.warn('[tiles] delete_tile failed', error.message)
    return { ok: false, reason: 'unreachable' }
  }
  return { ok: true }
}
