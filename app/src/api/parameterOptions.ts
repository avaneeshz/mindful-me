import { supabase } from '@/lib/supabaseClient'

export type ParameterType = 'quality' | 'symptom' | 'flag'

export interface ParameterOptionDto {
  id: string
  activityId: string | null
  parameterType: ParameterType
  label: string
  iconKey: string | null
  sortOrder: number
}

interface ParameterOptionRow {
  id: string
  activity_id: string | null
  parameter_type: ParameterType
  label: string
  icon_key: string | null
  sort_order: number
}

function fromRow(row: ParameterOptionRow): ParameterOptionDto {
  return {
    id: row.id,
    activityId: row.activity_id,
    parameterType: row.parameter_type,
    label: row.label,
    iconKey: row.icon_key,
    sortOrder: row.sort_order,
  }
}

/** Every option row THIS activity (or the fallback, if `activityId` is null) owns directly — for the "manage this activity's options" editor. Never the resolved/inherited list (see `apiListEffectiveParameterOptions` for that). */
export async function apiListParameterOptions(activityId: string | null): Promise<ParameterOptionDto[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_parameter_options', { p_activity_id: activityId })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] list_parameter_options failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as ParameterOptionRow[]).map(fromRow)
}

/** The resolved list a picker should actually show for `activityId` + `type` — this activity's own rows if any, else the nearest ancestor's, else this user's fallback default (`public.list_effective_parameter_options`, the inheritance rule — see `internal.effective_parameter_options`'s own doc comment). */
export async function apiListEffectiveParameterOptions(
  activityId: string | null,
  type: ParameterType,
): Promise<{ label: string; iconKey: string | null }[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_effective_parameter_options', {
    p_activity_id: activityId,
    p_type: type,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] list_effective_parameter_options failed', error.message)
    return null
  }
  return ((data ?? []) as { label: string; icon_key: string | null }[]).map((r) => ({
    label: r.label,
    iconKey: r.icon_key,
  }))
}

export async function apiProvisionDefaultParameterOptions(): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('provision_default_parameter_options')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] provision_default_parameter_options failed', error.message)
    return false
  }
  return true
}

export async function apiCreateParameterOption(input: {
  id: string
  parameterType: ParameterType
  label: string
  activityId?: string | null
  iconKey?: string | null
}): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_parameter_option', {
    p_id: input.id,
    p_parameter_type: input.parameterType,
    p_label: input.label,
    p_activity_id: input.activityId ?? null,
    p_icon_key: input.iconKey ?? null,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] create_parameter_option failed — kept locally, will retry on next load', error.message)
    return null
  }
  return data as string
}

export async function apiUpdateParameterOption(id: string, label: string, iconKey?: string | null): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('update_parameter_option', { p_id: id, p_label: label, p_icon_key: iconKey ?? null })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] update_parameter_option failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

export async function apiReorderParameterOptions(orderedIds: string[]): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('reorder_parameter_options', { p_ordered_ids: orderedIds })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] reorder_parameter_options failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

/** Same `{ok:false, reason}` contract as `apiDeleteTile`/`apiDeleteActivity` — `'has_history'` means this exact label has been stored on a real logged activity (rule 11: no delete-what-has-history mechanism exists for an option, only removal from future pickers via editing it out — see the report for why there's no "hide" equivalent here). */
export async function apiDeleteParameterOption(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }> {
  if (!supabase) return { ok: false, reason: 'unreachable' }
  const { error } = await supabase.rpc('delete_parameter_option', { p_id: id })
  if (error) {
    if (error.message.includes('parameter_option_has_history')) return { ok: false, reason: 'has_history' }
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] delete_parameter_option failed', error.message)
    return { ok: false, reason: 'unreachable' }
  }
  return { ok: true }
}

/** Removes every one of this activity's OWN option rows for one parameter type, falling back to inheritance — any row still in use is left in place (rule 11) rather than silently destroyed; `skippedLabels` names which ones survived so the UI can explain a partial reset. */
export async function apiResetParameterOptionsToInherited(
  activityId: string,
  type: ParameterType,
): Promise<{ ok: true; skippedLabels: string[] } | { ok: false }> {
  if (!supabase) return { ok: false }
  const { data, error } = await supabase.rpc('reset_parameter_options_to_inherited', {
    p_activity_id: activityId,
    p_parameter_type: type,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] reset_parameter_options_to_inherited failed', error.message)
    return { ok: false }
  }
  return { ok: true, skippedLabels: ((data ?? []) as { skipped_label: string }[]).map((r) => r.skipped_label) }
}
