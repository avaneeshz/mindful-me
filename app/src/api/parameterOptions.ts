import { supabase } from '@/lib/supabaseClient'

export type ParameterType = 'quality' | 'symptom' | 'flag'

/**
 * PICKER-CUSTOM-1 pivot: one shared, growable vocabulary per parameter type
 * (`public.parameter_options`) — no more independent per-activity free-text
 * lists (`activity_parameter_options`/`set_parameter_options_override`,
 * dropped in `20260925070000_parameter_options_global_vocabulary.sql`). Each
 * activity now only SELECTS which global options apply to it
 * (`public.activity_parameter_selections`) — see that migration's own doc
 * comment for the full reasoning and the inheritance rule.
 */
export interface ParameterOptionDto {
  id: string
  parameterType: ParameterType
  label: string
  iconKey: string | null
  sortOrder: number
}

interface ParameterOptionRow {
  id: string
  parameter_type: ParameterType
  label: string
  icon_key: string | null
  sort_order: number
}

function fromRow(row: ParameterOptionRow): ParameterOptionDto {
  return {
    id: row.id,
    parameterType: row.parameter_type,
    label: row.label,
    iconKey: row.icon_key,
    sortOrder: row.sort_order,
  }
}

/** This user's full global vocabulary — every type, for the top-level "manage your options" editor (`ParameterVocabularyPanel`). */
export async function apiListParameterOptions(): Promise<ParameterOptionDto[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_parameter_options')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] list_parameter_options failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as ParameterOptionRow[]).map(fromRow)
}

/**
 * The resolved list a picker should actually show for `activityId` + `type`
 * while LOGGING an activity — this activity's own selection if any, else the
 * nearest ancestor's, else every global option of that type
 * (`public.list_effective_parameter_options`, untouched by the pivot — see
 * that migration's own doc comment for why). Used by `useEffectiveParameterOptions`
 * (the logging flow, `SlotEditor`/`LogActivityModal`), never the editing
 * dialog's checklist (`apiListActivityParameterChecklist` below).
 */
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

/** Adds one label to the GLOBAL vocabulary for `type` — the only place free-text option entry exists any more. */
export async function apiCreateParameterOption(
  type: ParameterType,
  label: string,
  iconKey?: string | null,
  id?: string,
): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_parameter_option', {
    p_parameter_type: type,
    p_label: label,
    p_icon_key: iconKey ?? null,
    p_id: id ?? null,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] create_parameter_option failed — kept locally, will retry on next load', error.message)
    return null
  }
  return data as string
}

/**
 * Hard-deletes a global option with no real logged history under it. On
 * failure, `reason` tells the caller why: `'has_history'` (server-enforced —
 * rule 11), or `'unreachable'` (couldn't reach the server at all — the local
 * optimistic delete should be rolled back). Same contract `apiDeleteTile`/
 * `apiDeleteActivity` already use.
 */
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

/** One row of the per-activity checklist — every global option of `type`, whether it's currently effective for this activity, and whether this activity has ANY own selection rows for `type` at all (same value on every row — drives "Inherited" vs "Customized for this activity"). */
export interface ActivityParameterChecklistRow {
  optionId: string
  label: string
  iconKey: string | null
  sortOrder: number
  selected: boolean
  isOwn: boolean
}

interface ActivityParameterChecklistRawRow {
  option_id: string
  label: string
  icon_key: string | null
  sort_order: number
  selected: boolean
  is_own: boolean
}

/** The editing dialog's per-activity checklist for one parameter type — the whole global vocabulary, each row flagged with whether it's currently selected for `activityId`. */
export async function apiListActivityParameterChecklist(
  activityId: string,
  type: ParameterType,
): Promise<ActivityParameterChecklistRow[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_activity_parameter_checklist', {
    p_activity_id: activityId,
    p_type: type,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] list_activity_parameter_checklist failed', error.message)
    return null
  }
  return ((data ?? []) as ActivityParameterChecklistRawRow[]).map((r) => ({
    optionId: r.option_id,
    label: r.label,
    iconKey: r.icon_key,
    sortOrder: r.sort_order,
    selected: r.selected,
    isOwn: r.is_own,
  }))
}

/**
 * Toggles one global option on/off for one activity
 * (`public.set_activity_parameter_selection`). If this activity was purely
 * inheriting so far, the server materializes everything it used to inherit
 * as its own explicit selection first, then applies this one change — see
 * that function's own doc comment. No history-safety concern here (unlike
 * deleting a global option): a selection row is never the logged value
 * itself.
 */
export async function apiSetActivityParameterSelection(
  activityId: string,
  type: ParameterType,
  optionId: string,
  selected: boolean,
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('set_activity_parameter_selection', {
    p_activity_id: activityId,
    p_parameter_type: type,
    p_option_id: optionId,
    p_selected: selected,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] set_activity_parameter_selection failed', error.message)
    return false
  }
  return true
}

/** Clears this activity's own selection rows for one type, reverting to inheritance. Never partially honored (no history-safety concern — see `apiSetActivityParameterSelection`'s own doc comment). */
export async function apiResetActivityParameterSelectionToInherited(
  activityId: string,
  type: ParameterType,
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('reset_activity_parameter_selection_to_inherited', {
    p_activity_id: activityId,
    p_parameter_type: type,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[parameterOptions] reset_activity_parameter_selection_to_inherited failed', error.message)
    return false
  }
  return true
}
