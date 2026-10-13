import { daysBetweenISO } from '@/domain/quickLog'
import { dateFromLocalMinutes, localDateISO, localMinutesOf } from '@/lib/localTime'
import { supabase } from '@/lib/supabaseClient'
import type {
  ActivityQuality,
  FieldSelections,
  FlagId,
  ReflectionEntry,
  ScheduleStatus,
  ScheduledActivity,
  Symptom,
} from '@/domain/types'
import { catalogIdForName, nameForCatalogId } from './catalog'
import { numberForReflectionCardId, reflectionCardIdForNumber } from './reflectionCards'

function dayShiftMinutes(localDate: string, axisDate?: Date): number {
  if (!axisDate) return 0
  return (daysBetweenISO(localDateISO(axisDate), localDate) ?? 0) * 1440
}

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
  /** Deprecated — superseded by `field_selections` below. See `20260921060000_dynamic_note_fields.sql`. Never read by the client any more. */
  sleep_quality: string[] | null
  dreams: string | null
  field_selections: { note_field_id: string; selected_labels: string[] | null }[] | null
}

/** `ScheduledActivity.fieldSelections`'s wire shape, built from the DTO's `field_selections` array. */
function fieldSelectionsFromDto(dto: ScheduledActivityDto): FieldSelections {
  const entries = dto.field_selections ?? []
  return Object.fromEntries(entries.map((f) => [f.note_field_id, f.selected_labels ?? []]))
}

/** The inverse — `FieldSelections` -> the jsonb array `p_field_selections` expects. Empty-selection fields are dropped rather than sent as noise. */
function fieldSelectionsToParam(selections: FieldSelections): { note_field_id: string; selected_labels: string[] }[] {
  return Object.entries(selections)
    .filter(([, labels]) => labels.length > 0)
    .map(([note_field_id, selected_labels]) => ({ note_field_id, selected_labels }))
}

/**
 * `axisDate`, when given, is the day the caller's minute axis is anchored to
 * (Classic's 06:00 -> 06:00 page, `domain/windowAxis.ts`): a row that started on
 * another day comes back with its start shifted by whole days (so the day before
 * is negative) rather than as raw own-day minutes, which would draw it on the
 * wrong day. Omitted, `startMinutes` is the row's own-day minutes, as ever.
 */
async function dtoToClient(dto: ScheduledActivityDto, axisDate?: Date): Promise<ScheduledActivity> {
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
    startMinutes: dto.start_minute + dayShiftMinutes(dto.local_date, axisDate),
    durationMinutes: dto.duration_minutes,
    flags: (dto.flags ?? []) as FlagId[],
    quality: (dto.quality ?? []) as ActivityQuality[],
    symptoms: (dto.symptoms ?? []) as Symptom[],
    notes: dto.notes ?? null,
    reflections,
    fieldSelections: fieldSelectionsFromDto(dto),
    dreamsNote: dto.dreams ?? null,
    status: (dto.status as ScheduleStatus) ?? 'planned',
    timezone: dto.timezone,
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
    // From the real instant, not the raw minutes: on Classic's page axis a start can be
    // negative (the day before) or past 1439 (the next morning).
    p_start_minute: localMinutesOf(startAt),
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
  axisDate?: Date,
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
  return Promise.all(((data ?? []) as ScheduledActivityDto[]).map((dto) => dtoToClient(dto, axisDate)))
}

/** One row from `apiListScheduledActivitiesWithDates` — see its own doc comment for why the date rides along. */
export interface ScheduledActivityWithDate {
  activity: ScheduledActivity
  /** The calendar day this activity belongs to (rule 2 — the day it started on), `YYYY-MM-DD` local to when it was scheduled. */
  localDate: string
}

/**
 * Same bounded-range read as `apiListScheduledActivities` (rule 8 still
 * applies — the caller must still pass a bounded window), but keeps each
 * row's own `local_date` alongside it. Every existing caller of
 * `apiListScheduledActivities` only ever queries a single calendar day
 * (`lib/localTime.ts`'s `localDayRange(viewedDate)`), where
 * `ScheduledActivity.startMinutes` (minutes since ITS OWN midnight) is enough
 * on its own. `useSessionHistory`'s cross-day lookback is the first caller
 * that spans MULTIPLE days in one query, so it needs the actual calendar day
 * each row belongs to — to sort chronologically across days and to exclude
 * one specific day (the one already shown as "Recent") — which the plain
 * `ScheduledActivity` shape alone can't tell you. A separate function rather
 * than changing `apiListScheduledActivities`'s return shape, so every
 * existing single-day call site is untouched.
 */
export async function apiListScheduledActivitiesWithDates(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ScheduledActivityWithDate[] | null> {
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
  return Promise.all(
    ((data ?? []) as ScheduledActivityDto[]).map(async (dto) => ({
      activity: await dtoToClient(dto),
      localDate: dto.local_date,
    })),
  )
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
    p_dreams: activity.dreamsNote,
    p_field_selections: fieldSelectionsToParam(activity.fieldSelections),
  })
  if (error) throw error
}

export async function apiRescheduleScheduledActivity(
  activity: ScheduledActivity,
  reference: Date,
): Promise<void> {
  if (!supabase) return
  const params = await scheduleParams(activity, reference)
  // Quality, symptoms and notes are all bundled into reschedule too (unlike
  // flags, kept deliberately separate — see the migration's own comment):
  // the client always sends the full CURRENT value of each on every
  // reschedule, never omitted, and the RPC unconditionally overwrites them,
  // same contract every other bundled column has. Reflections deliberately
  // do NOT ride along here — mapping a card to an activity is its own,
  // later action (`apiAddScheduledActivityReflection`/
  // `apiRemoveScheduledActivityReflection` below), never bundled into a
  // time/duration/quality/etc. edit.
  const { error } = await supabase.rpc('reschedule_scheduled_activity', {
    p_id: activity.id,
    ...params,
    p_quality: activity.quality,
    p_symptoms: activity.symptoms,
    p_notes: activity.notes,
    p_dreams: activity.dreamsNote,
    p_field_selections: fieldSelectionsToParam(activity.fieldSelections),
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

/** Parity with `apiSetScheduledActivityQuality` — a field-selections-only edit (any number of multiselect-kind note fields at once) with no accompanying time change. */
export async function apiSetScheduledActivityFieldSelections(id: string, fieldSelections: FieldSelections): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_field_selections', {
    p_id: id,
    p_field_selections: fieldSelectionsToParam(fieldSelections),
  })
  if (error) throw error
}

/** Parity with `apiSetScheduledActivityNotes` — a Dreams-only edit with no accompanying time change. */
export async function apiSetScheduledActivityDreams(id: string, dreams: string | null): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_scheduled_activity_dreams', { p_id: id, p_dreams: dreams })
  if (error) throw error
}

/**
 * Maps one reflection card onto an already-logged activity, with its own
 * note — an upsert (replaces just THAT card's note if it was already
 * mapped, adds it otherwise), never a bulk replace of the activity's whole
 * reflection set. This is the actual usage pattern (see `state/
 * boardReducer.ts`'s `mapReflectionCard` doc comment): reflection mapping
 * happens as its own later action, potentially adding cards one at a time
 * over hours, never bundled into create/reschedule.
 *
 * A card number the local catalog hasn't resolved to a real DB id yet
 * (offline, not loaded) silently no-ops the SYNC call only — local state
 * already has the mapping, and it catches up on the next successful sync.
 */
export async function apiAddScheduledActivityReflection(
  scheduledActivityId: string,
  card: number,
  note: string,
): Promise<void> {
  if (!supabase) return
  const cardId = await reflectionCardIdForNumber(card)
  if (!cardId) return
  const { error } = await supabase.rpc('add_scheduled_activity_reflection', {
    p_scheduled_activity_id: scheduledActivityId,
    p_reflection_card_id: cardId,
    p_note: note.trim() ? note : null,
  })
  if (error) throw error
}

/** The inverse of `apiAddScheduledActivityReflection` — drops one card's mapping only. */
export async function apiRemoveScheduledActivityReflection(scheduledActivityId: string, card: number): Promise<void> {
  if (!supabase) return
  const cardId = await reflectionCardIdForNumber(card)
  if (!cardId) return
  const { error } = await supabase.rpc('remove_scheduled_activity_reflection', {
    p_scheduled_activity_id: scheduledActivityId,
    p_reflection_card_id: cardId,
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
