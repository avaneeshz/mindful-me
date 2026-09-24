import { supabase } from '@/lib/supabaseClient'
import type { ActivityRow } from '@/domain/pickerHierarchy'

interface ActivityRowDb {
  id: string
  name: string
  tile_id: string | null
  parent_id: string | null
  icon_key: string | null
  hidden: boolean
  sort_order: number
}

function fromRow(row: ActivityRowDb): ActivityRow {
  return {
    id: row.id,
    name: row.name,
    tileId: row.tile_id,
    parentId: row.parent_id,
    iconKey: row.icon_key,
    hidden: row.hidden,
    sortOrder: row.sort_order,
  }
}

/** This user's own full activity tree, flat (`public.list_activities()`) — `state/useActivityHierarchy.ts` turns it into a tree per tile via `domain/pickerHierarchy.ts`. Same null-on-failure contract as every other `api/*` list function here. */
export async function apiListActivities(): Promise<ActivityRow[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_activities')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityHierarchy] list_activities failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as ActivityRowDb[]).map(fromRow)
}

/** Gives a user with zero owned `activities` rows a full copy of the shared catalog (`public.provision_default_activities()`), linked to their own tiles (provisioning those first if needed). Idempotent server-side. */
export async function apiProvisionDefaultActivities(): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('provision_default_activities')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityHierarchy] provision_default_activities failed', error.message)
    return false
  }
  return true
}

/** Exactly one of `tileId` (a new top-level activity) or `parentId` (a new drill-down option, at any depth) must be set. `id` is client-supplied for the same idempotent-retry reason every create RPC in this schema takes one. */
export async function apiCreateActivity(input: {
  id: string
  name: string
  tileId?: string | null
  parentId?: string | null
  iconKey?: string | null
}): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_activity', {
    p_id: input.id,
    p_name: input.name,
    p_tile_id: input.tileId ?? null,
    p_parent_id: input.parentId ?? null,
    p_icon_key: input.iconKey ?? null,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityHierarchy] create_activity failed — kept locally, will retry on next load', error.message)
    return null
  }
  return data as string
}

export async function apiUpdateActivity(id: string, name: string, iconKey?: string | null): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('update_activity', { p_id: id, p_name: name, p_icon_key: iconKey ?? null })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityHierarchy] update_activity failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

export async function apiSetActivityHidden(id: string, hidden: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('set_activity_hidden', { p_id: id, p_hidden: hidden })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityHierarchy] set_activity_hidden failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

export async function apiReorderActivities(orderedIds: string[]): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('reorder_activities', { p_ordered_ids: orderedIds })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityHierarchy] reorder_activities failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

/** Same `{ok:false, reason}` contract as `apiDeleteTile` — `'has_history'` means the server found real `scheduled_activities` history under this node (rule 11: hide instead), `'unreachable'` means the request itself failed. */
export async function apiDeleteActivity(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('delete_activity', { p_id: id })
  if (error) {
    if (error.message.includes('activity_has_history_use_hide')) return { ok: false, reason: 'has_history' }
    // eslint-disable-next-line no-console
    console.warn('[activityHierarchy] delete_activity failed', error.message)
    return { ok: false, reason: 'unreachable' }
  }
  return { ok: true }
}
