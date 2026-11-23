import { supabase } from '@/lib/supabaseClient'
import type { ActivityField, ActivityFieldKind, ActivityFieldOption, FieldValues, StandardFieldKey } from '@/domain/activityFields'

interface OptionRow {
  id: string
  label: string
  sort_order: number
  hidden: boolean
}

interface FieldRow {
  id: string
  activity_id: string
  kind: ActivityFieldKind
  label: string
  sort_order: number
  hidden: boolean
  legacy_key: StandardFieldKey | null
  options: OptionRow[] | null
}

function optionFromRow(row: OptionRow): ActivityFieldOption {
  return { id: row.id, label: row.label, sortOrder: row.sort_order, hidden: row.hidden }
}

function fieldFromRow(row: FieldRow): ActivityField {
  return {
    id: row.id,
    activityId: row.activity_id,
    kind: row.kind,
    label: row.label,
    sortOrder: row.sort_order,
    hidden: row.hidden,
    legacyKey: row.legacy_key,
    options: (row.options ?? []).map(optionFromRow),
  }
}

/**
 * `duplicate` is a PERMANENT rejection (the title is already used on this
 * activity / field) — no retry can fix it, unlike `unreachable`. Distinguished
 * so the caller can roll back the optimistic local change instead of leaving
 * something that can never sync.
 */
export type FieldWriteResult = { ok: true } | { ok: false; reason: 'duplicate' | 'unreachable' }

function toResult(error: { message: string } | null, what: string): FieldWriteResult {
  if (!error) return { ok: true }
  if (error.message.includes('duplicate_field_label') || error.message.includes('duplicate_option_label')) {
    return { ok: false, reason: 'duplicate' }
  }
  // eslint-disable-next-line no-console
  console.warn(`[activityFields] ${what} failed`, error.message)
  return { ok: false, reason: 'unreachable' }
}

/** Every field (with its options) on every one of this user's top-level activities (`public.list_activity_fields`). Null when the server can't be reached. */
export async function apiListActivityFields(): Promise<ActivityField[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_activity_fields')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityFields] list_activity_fields failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as FieldRow[]).map(fieldFromRow)
}

export async function apiCreateActivityField(
  id: string,
  activityId: string,
  kind: ActivityFieldKind,
  label: string,
): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('create_activity_field', { p_id: id, p_activity_id: activityId, p_kind: kind, p_label: label })
  return toResult(error, 'create_activity_field')
}

export async function apiRenameActivityField(id: string, label: string): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('update_activity_field', { p_id: id, p_label: label })
  return toResult(error, 'update_activity_field')
}

export async function apiSetActivityFieldHidden(id: string, hidden: boolean): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('update_activity_field', { p_id: id, p_hidden: hidden })
  return toResult(error, 'update_activity_field')
}

export async function apiReorderActivityFields(activityId: string, orderedIds: string[]): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('reorder_activity_fields', { p_activity_id: activityId, p_ids: orderedIds })
  return toResult(error, 'reorder_activity_fields')
}

export async function apiCreateActivityFieldOption(id: string, fieldId: string, label: string): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('create_activity_field_option', { p_id: id, p_field_id: fieldId, p_label: label })
  return toResult(error, 'create_activity_field_option')
}

export async function apiRenameActivityFieldOption(id: string, label: string): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('update_activity_field_option', { p_id: id, p_label: label })
  return toResult(error, 'update_activity_field_option')
}

export async function apiSetActivityFieldOptionHidden(id: string, hidden: boolean): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('update_activity_field_option', { p_id: id, p_hidden: hidden })
  return toResult(error, 'update_activity_field_option')
}

export async function apiReorderActivityFieldOptions(fieldId: string, orderedIds: string[]): Promise<FieldWriteResult> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('reorder_activity_field_options', { p_field_id: fieldId, p_ids: orderedIds })
  return toResult(error, 'reorder_activity_field_options')
}

interface ValueRow {
  scheduled_activity_id: string
  field_id: string
  text: string | null
  labels: string[] | null
}

/** Logged values for these entries, keyed by entry id then field id. Null when the server can't be reached. */
export async function apiListFieldValues(scheduledActivityIds: string[]): Promise<Record<string, FieldValues> | null> {
  if (!supabase) return null
  if (scheduledActivityIds.length === 0) return {}
  const { data, error } = await supabase.rpc('list_scheduled_activity_field_values', { p_ids: scheduledActivityIds })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[activityFields] list_scheduled_activity_field_values failed', error.message)
    return null
  }
  const out: Record<string, FieldValues> = {}
  for (const row of (data ?? []) as ValueRow[]) {
    ;(out[row.scheduled_activity_id] ??= {})[row.field_id] = { text: row.text, labels: row.labels ?? [] }
  }
  return out
}

/** Replaces all of one logged entry's custom-field values (`set_scheduled_activity_field_values`). Throws on failure, like every other scheduled-activity write, so the sync queue can retry. */
export async function apiSetFieldValues(scheduledActivityId: string, values: FieldValues): Promise<void> {
  if (!supabase) return
  const payload = Object.entries(values).map(([field_id, v]) => ({ field_id, text: v.text, labels: v.labels }))
  const { error } = await supabase.rpc('set_scheduled_activity_field_values', { p_id: scheduledActivityId, p_values: payload })
  if (error) throw error
}
