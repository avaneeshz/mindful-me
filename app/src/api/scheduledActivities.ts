import { dateFromLocalMinutes, localDateISO } from '@/lib/localTime'
import { supabase } from '@/lib/supabaseClient'
import type { FlagId, ScheduleStatus, ScheduledActivity } from '@/domain/types'
import type { LosingEditRecord } from '@/state/sync'
import { catalogIdForName, nameForCatalogId } from './catalog'

/** The shape `public.scheduled_activity_dto` (see the Phase 2 migrations) hands back. */
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
  status: string
  created_at: string
  updated_at: string
}

async function dtoToClient(dto: ScheduledActivityDto): Promise<ScheduledActivity> {
  const name = dto.activity_id ? await nameForCatalogId(dto.activity_id) : null
  return {
    id: dto.id,
    name,
    path: dto.path ?? [],
    startMinutes: dto.start_minute,
    durationMinutes: dto.duration_minutes,
    flags: (dto.flags ?? []) as FlagId[],
    status: (dto.status as ScheduleStatus) ?? 'planned',
    timezone: dto.timezone,
    // Phase 5, rule 7: the server's own "when did this row last change",
    // carried through to the client so `state/reconcile.ts` can compare it
    // against a queued local edit's device-clock stamp. Never derived here.
    updatedAt: dto.updated_at,
  }
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
  })
  if (error) throw error
}

export async function apiRescheduleScheduledActivity(
  activity: ScheduledActivity,
  reference: Date,
): Promise<void> {
  if (!supabase) return
  const params = await scheduleParams(activity, reference)
  const { error } = await supabase.rpc('reschedule_scheduled_activity', { p_id: activity.id, ...params })
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

/**
 * Rule 7 — writes the LOSING side of a last-write-wins resolution into
 * `activity_events`, so it is kept rather than silently discarded. See
 * `supabase/migrations/20260827090000_local_edit_conflicts.sql` for why this
 * needs its own narrow RPC (the table has no client insert policy at all).
 *
 * In local-only mode (no Supabase configured) this resolves without doing
 * anything — but the record is NOT lost: it stays in the persisted sync
 * queue, which is itself on the device, until there is somewhere to send it.
 */
export async function apiRecordLocalEditConflict(
  activityId: string | null,
  record: LosingEditRecord,
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('record_local_edit_conflict', {
    p_scheduled_activity_id: activityId,
    p_event_type: record.reason === 'superseded' ? 'superseded_local_edit' : 'rejected_local_edit',
    p_payload: {
      lost_intent: record.intent,
      edited_at: record.editedAt,
      local_date: record.dayISO,
      server_updated_at: record.serverUpdatedAt ?? null,
      server_error: record.serverError ?? null,
      // The losing edit verbatim. Deliberately excludes `flags`, which are
      // sensitive (rule 10) and are only ever stored encrypted — a conflict
      // note is not a back door around that. What is kept is enough to see
      // exactly what was lost and to re-enter it by hand.
      activity: record.activity
        ? {
            id: record.activity.id,
            name: record.activity.name,
            path: record.activity.path,
            start_minute: record.activity.startMinutes,
            duration_minutes: record.activity.durationMinutes,
            status: record.activity.status,
            timezone: record.activity.timezone,
            flag_count: record.activity.flags.length,
          }
        : null,
    },
  })
  if (error) throw error
}
