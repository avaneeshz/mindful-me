import { supabase } from '@/lib/supabaseClient'
import { headerButtonConfigFromDto, type HeaderButtonConfig, type HeaderButtonDto } from '@/domain/headerButtons'

/**
 * The effective per-user button list — `public.list_header_buttons()`.
 * Returns `null` (never `[]`) on any failure to reach/read the server, so a
 * caller can tell "genuinely nothing configured" from "couldn't check" and
 * knows not to overwrite local state in the latter case — mirrors every
 * other `api/*` list function in this project.
 */
export async function apiListHeaderButtons(): Promise<HeaderButtonConfig[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_header_buttons')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[headerButtons] list_header_buttons failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as HeaderButtonDto[]).map(headerButtonConfigFromDto)
}

export interface CreateHeaderButtonInput {
  id: string
  category: HeaderButtonConfig['category']
  label: string
  key?: string | null
  activityId?: string | null
  entryMode?: 'duration' | 'songCount'
  quickLogType?: boolean
  quickLogTypeLabel?: string | null
  quickLogSleepQuality?: boolean
  dayValueUnit?: 'min' | 'int' | 'target' | null
  dayValueTarget?: number | null
  noteFields?: { key: 'primary' | 'secondary'; label: string }[]
  noteTypes?: string[]
  checklistItems?: { label: string }[]
}

/**
 * Creates a user-owned button. `input.id` is client-supplied (same
 * idempotent-retry convention `apiCreateScheduledActivity` already uses) so
 * a dropped-connection retry never creates a duplicate. Returns `null` on
 * failure to reach/read the server — the caller already holds the
 * local-first copy (rule 6).
 */
export async function apiCreateHeaderButton(input: CreateHeaderButtonInput): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_header_button', {
    p_category: input.category,
    p_label: input.label,
    p_id: input.id,
    p_key: input.key ?? null,
    p_activity_id: input.activityId ?? null,
    p_entry_mode: input.entryMode === 'songCount' ? 'song_count' : 'duration',
    p_quick_log_type: input.quickLogType ?? false,
    p_quick_log_type_label: input.quickLogTypeLabel ?? null,
    p_quick_log_sleep_quality: input.quickLogSleepQuality ?? false,
    p_day_value_unit: input.dayValueUnit ?? null,
    p_day_value_target: input.dayValueTarget ?? null,
    p_note_fields: input.noteFields ?? [],
    p_note_types: input.noteTypes ?? [],
    p_checklist_items: input.checklistItems ?? [],
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[headerButtons] create_header_button failed — kept locally, will retry on next load', error.message)
    return null
  }
  return data as string
}

export interface UpdateHeaderButtonInput {
  id: string
  label: string
  quickLogTypeLabel?: string | null
  quickLogSleepQuality?: boolean | null
  dayValueTarget?: number | null
  noteFields?: { key: 'primary' | 'secondary'; label: string }[] | null
  noteTypes?: string[] | null
  checklistItems?: { key?: string; label: string }[] | null
}

export async function apiUpdateHeaderButton(input: UpdateHeaderButtonInput): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('update_header_button', {
    p_id: input.id,
    p_label: input.label,
    p_quick_log_type_label: input.quickLogTypeLabel ?? null,
    p_quick_log_sleep_quality: input.quickLogSleepQuality ?? null,
    p_day_value_target: input.dayValueTarget ?? null,
    p_note_fields: input.noteFields ?? null,
    p_note_types: input.noteTypes ?? null,
    p_checklist_items: input.checklistItems ?? null,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[headerButtons] update_header_button failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

export async function apiSetHeaderButtonHidden(headerButtonId: string, hidden: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('set_header_button_hidden', {
    p_header_button_id: headerButtonId,
    p_hidden: hidden,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[headerButtons] set_header_button_hidden failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}

export async function apiReorderHeaderButtons(orderedIds: string[]): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('reorder_header_buttons', { p_ordered_ids: orderedIds })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[headerButtons] reorder_header_buttons failed — kept locally, will retry on next load', error.message)
    return false
  }
  return true
}
