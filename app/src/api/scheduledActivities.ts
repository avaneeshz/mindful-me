import { dateFromLocalMinutes, localDateISO } from '@/lib/localTime'
import { supabase } from '@/lib/supabaseClient'
import type {
  ActivityQuality,
  FlagId,
  ReflectionEntry,
  ScheduleStatus,
  ScheduledActivity,
  Symptom,
} from '@/domain/types'
import { catalogIdForName, nameForCatalogId } from './catalog'
import { numberForReflectionCardId, reflectionCardIdForNumber } from './reflectionCards'

/** The shape `public.scheduled_activity_dto` (see the Phase 2/quality/reflections migrations) hands back. */
interface ScheduledActivityDto {
  id: string
  activity_id: string | null
  path: string[] | null
  start_at: string
  duration_minutes: number
  local_date: string
  start_minute: number
  timezone: string
  flags: string[] | null
  quality: string[] | null
  status: string
  created_at: string
  updated_at: string
  symptoms: string[] | null
  notes: string | null
  reflections: { card_id: string; note: string | null }[] | null
}

async function dtoToClient(dto: ScheduledActivityDto): Promise<ScheduledActivity> {
  const name = dto.activity_id ? await nameForCatalogId(dto.activity_id) : null
  const reflections = (
    await Promise.all(
      (dto.reflections ?? []).map(async (r): Promise<ReflectionEntry | null> => {
        const card = await numberForReflectionCardId(r.card_id)
        // A card id the client's own catalog doesn't recognize (not yet
        // loaded, or a personal card from another device) is dropped rather
        // than surfaced as a broken entry — same defensive posture
        // `nameForCatalogId` already has for `activity_id`.
        return card === null ? null : { card, note: r.note ?? '' }
      }),
    )
  ).filter((r): r is ReflectionEntry => r !== null)
  return {
    id: dto.id,
    name,
    path: dto.path ?? [],
    startMinutes: dto.start_minute,
    durationMinutes: dto.duration_minutes,
    flags: (dto.flags ?? []) as FlagId[],
    quality: (dto.quality ?? []) as ActivityQuality[],
    symptoms: (dto.symptoms ?? []) as Symptom[],
    notes: dto.notes ?? null,
    reflections,
    status: (dto.status as ScheduleStatus) ?? 'planned',
    timezone: dto.timezone,
  }
}

/**
 * `ScheduledActivity.reflections` (catalog-number-keyed) -> the JSON shape
 * `create_scheduled_activity`/`reschedule_scheduled_activity`/
 * `set_scheduled_activity_reflections` accept (`{card_id, note}[]`, real DB
 * ids). A card number the catalog can't resolve yet (offline, not loaded) is
 * dropped from this SYNC call only — it stays intact in local state and
 * catches up on the next successful sync, same as `scheduleParams`'
 * `activity_id` resolution.
 */
async function reflectionsParam(
  reflections: readonly ReflectionEntry[],
): Promise<{ card_id: string; note: string | null }[]> {
  const resolved = await Promise.all(
    reflections.map(async (r) => {
      const cardId = await reflectionCardIdForNumber(r.card)
      return cardId ? { card_id: cardId, note: r.note.trim() ? r.note : null } : null
    }),
  )
  return resolved.filter((r): r is { card_id: string; note: string | null } => r !== null)
}

/**
 * The fields every create/reschedule call needs, derived from the client
 * shape plus `reference` — the calendar day `activity.startMinutes` is
 * anchored to (normally "today", i.e. the same `now` the board itself uses;
 * see `lib/localTime.ts` for why this needs no timezone library).
 */
async function scheduleParams(activity: ScheduledActivity, reference: Date) {
  const activityId = activity.name ? await catalogIdForName(activity.name) : null
  const startAt = dateFromLocalMinutes(reference, activity.startMinutes)
  return {
    p_activity_id: activityId,
    p_path: activity.path,
    p_start_at: startAt.toISOString(),
    p_duration_minutes: activity.durationMinutes,
    p_local_date: localDateISO(startAt),
    p_start_minute: Math.min(1439, Math.max(0, activity.startMinutes)),
    p_timezone: activity.timezone,
  }
}

/**
 * Rule 8: always a bounded window — never the user's full history.
 *
 * Returns `null` (never `[]`) on any failure to reach/read the server, so a
 * caller can tell "genuinely nothing scheduled" from "couldn't check" and
 * knows not to overwrite local state in the latter case.
 */
export async function apiListScheduledActivities(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ScheduledActivity[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_scheduled_activities', {
    p_range_start: rangeStart.toISOString(),
    p_range_end: rangeEnd.toISOString(),
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[sync] list_scheduled_activities failed — staying on local data', error.message)
    return null
  }
  return Promise.all(((data ?? []) as ScheduledActivityDto[]).map(dtoToClient))
}

export async function apiCreateScheduledActivity(activity: ScheduledActivity, reference: Date): Promise<void> {
  if (!supabase) return
  const params = await scheduleParams(activity, reference)
  const { error } = await supabase.rpc('create_scheduled_activity', {
    ...params,
    p_flags: activity.flags,
    p_id: activity.id,
    p_quality: activity.quality,
    p_symptoms: activity.symptoms,
    p_notes: activity.notes,
    p_reflections: await reflectionsParam(activity.reflections),
  })
  if (error) throw error
}

export async function apiRescheduleScheduledActivity(
  activity: ScheduledActivity,
  reference: Date,
): Promise<void> {
  if (!supabase) return
  const params = await scheduleParams(activity, reference)
  // Quality, symptoms, notes and reflections are all bundled into reschedule
  // too (unlike flags, kept deliberately separate — see the migration's own
  // comment): the client always sends the full CURRENT value of each on
  // every reschedule, never omitted, and the RPC unconditionally overwrites
  // them, same contract every other bundled column has.
  const { error } = await supabase.rpc('reschedule_scheduled_activity', {
    p_id: activity.id,
    ...params,
    p_quality: activity.quality,
    p_symptoms: activity.symptoms,
    p_notes: activity.notes,
    p_reflections: await reflectionsParam(activity.reflections),
  })
  if (error) throw error
}

export async function apiSetScheduledActivityStatus(id: string, status: ScheduleStatus): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_status', { p_id: id, p_status: status })
  if (error) throw error
}

export async function apiSetScheduledActivityFlags(id: string, flags: FlagId[]): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_flags', { p_id: id, p_flags: flags })
  if (error) throw error
}

/** Parity with `apiSetScheduledActivityFlags` — a quality-only edit with no accompanying time change. */
export async function apiSetScheduledActivityQuality(id: string, quality: ActivityQuality[]): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_quality', { p_id: id, p_quality: quality })
  if (error) throw error
}

/** Parity with `apiSetScheduledActivityFlags` — a symptoms-only edit with no accompanying time change. */
export async function apiSetScheduledActivitySymptoms(id: string, symptoms: Symptom[]): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_symptoms', { p_id: id, p_symptoms: symptoms })
  if (error) throw error
}

/** Parity with `apiSetScheduledActivityQuality` — a notes-only edit with no accompanying time change. */
export async function apiSetScheduledActivityNotes(id: string, notes: string | null): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_notes', { p_id: id, p_notes: notes })
  if (error) throw error
}

/** Parity with `apiSetScheduledActivitySymptoms` — a reflections-only edit with no accompanying time change. */
export async function apiSetScheduledActivityReflections(id: string, reflections: ReflectionEntry[]): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_reflections', {
    p_id: id,
    p_reflections: await reflectionsParam(reflections),
  })
  if (error) throw error
}

/** Rule 11: soft delete, recoverable for 30 days. */
export async function apiSoftDeleteScheduledActivity(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('soft_delete_scheduled_activity', { p_id: id })
  if (error) throw error
}

export async function apiRestoreScheduledActivity(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('restore_scheduled_activity', { p_id: id })
  if (error) throw error
}
