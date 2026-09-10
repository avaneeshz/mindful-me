-- Revision: reflection-card mapping is NOT part of logging/editing an
-- activity — it is a fully separate, later action (potentially hours after
-- the activity was logged), and the actual usage pattern is adding/removing
-- ONE card's mapping at a time (with its own note), never a bulk
-- replace-the-full-set call. This migration undoes the previous pass's
-- bundling into create_scheduled_activity/reschedule_scheduled_activity and
-- replaces the bulk `set_scheduled_activity_reflections` with two
-- incremental RPCs. The schema itself (`reflection_cards`,
-- `scheduled_activity_reflections`, its encrypted per-pairing note,
-- `scheduled_activity_dto.reflections`) is UNCHANGED — this is a write-path
-- revision only; every read still returns each activity's currently-mapped
-- reflection cards exactly as before.
--
-- `create_scheduled_activity`/`reschedule_scheduled_activity` revert to the
-- signatures they had immediately before reflections were bundled in (see
-- 20260904132230_scheduled_activity_symptoms_and_notes.sql /
-- 20260829223811_scheduled_activity_quality.sql for the precedent bodies) —
-- no `p_reflections` parameter, no reflections write inside them at all.
-- `to_scheduled_activity_dto`/`scheduled_activity_dto` are untouched (no
-- type drop needed — only these two functions' bodies/signatures change).

drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb);

create function public.create_scheduled_activity(
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_flags text[] default '{}',
  p_id uuid default null,
  p_quality text[] default '{}',
  p_symptoms text[] default '{}',
  p_notes text default null
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform internal.assert_valid_quality(p_quality);
  perform internal.assert_valid_symptoms(p_symptoms);

  if p_duration_minutes > 0 then
    v_ceiling := public.scheduling_ceiling(auth.uid(), p_start_at, null);
    if p_duration_minutes > v_ceiling then
      raise exception 'schedule_conflict: % minutes requested, % available', p_duration_minutes, v_ceiling
        using errcode = 'P0001', detail = v_ceiling::text;
    end if;
  end if;

  insert into public.scheduled_activities (
    id, user_id, activity_id, path, start_at, end_at, duration_minutes,
    local_date, start_minute, timezone, flags_encrypted, quality_encrypted, status,
    symptoms_encrypted, notes_encrypted
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_activity_id, coalesce(p_path, '{}'), p_start_at,
    p_start_at + make_interval(mins => p_duration_minutes), p_duration_minutes,
    p_local_date, p_start_minute, p_timezone, internal.encrypt_flags(p_flags),
    internal.encrypt_quality(p_quality), 'planned',
    internal.encrypt_symptoms(p_symptoms), internal.encrypt_notes(p_notes)
  )
  on conflict (id) do update set
    -- Idempotent retry (rule 6's background sync may resend the same create
    -- after a dropped connection) — see the original migration's comment.
    activity_id = excluded.activity_id,
    path = excluded.path,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    duration_minutes = excluded.duration_minutes,
    local_date = excluded.local_date,
    start_minute = excluded.start_minute,
    timezone = excluded.timezone,
    flags_encrypted = excluded.flags_encrypted,
    quality_encrypted = excluded.quality_encrypted,
    symptoms_encrypted = excluded.symptoms_encrypted,
    notes_encrypted = excluded.notes_encrypted
  where public.scheduled_activities.user_id = auth.uid()
  returning * into v_row;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text) to authenticated;

drop function if exists public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb);

create function public.reschedule_scheduled_activity(
  p_id uuid,
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_quality text[] default '{}',
  p_symptoms text[] default '{}',
  p_notes text default null
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_quality(p_quality);
  perform internal.assert_valid_symptoms(p_symptoms);

  if p_duration_minutes > 0 then
    v_ceiling := public.scheduling_ceiling(auth.uid(), p_start_at, p_id);
    if p_duration_minutes > v_ceiling then
      raise exception 'schedule_conflict: % minutes requested, % available', p_duration_minutes, v_ceiling
        using errcode = 'P0001', detail = v_ceiling::text;
    end if;
  end if;

  update public.scheduled_activities set
    activity_id = p_activity_id,
    path = coalesce(p_path, '{}'),
    start_at = p_start_at,
    end_at = p_start_at + make_interval(mins => p_duration_minutes),
    duration_minutes = p_duration_minutes,
    local_date = p_local_date,
    start_minute = p_start_minute,
    timezone = p_timezone,
    quality_encrypted = internal.encrypt_quality(p_quality),
    symptoms_encrypted = internal.encrypt_symptoms(p_symptoms),
    notes_encrypted = internal.encrypt_notes(p_notes)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text) from public, anon;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text) to authenticated;

-- The bulk replace-the-full-set setter is superseded by the two incremental
-- RPCs below — drop it outright rather than leave unused surface area that
-- no longer matches the real interaction model.
drop function if exists public.set_scheduled_activity_reflections(uuid, jsonb);

-- Maps ONE reflection card onto an already-logged activity, with its own
-- note — an upsert: replaces just that one pairing's note if it already
-- existed, adds it otherwise, and never touches any of the activity's OTHER
-- reflections. This is the actual usage pattern: cards get mapped one at a
-- time, potentially hours apart, each independently. `p_reflection_card_id`
-- is inner-joined against the cards this user can actually see (system
-- default or their own), so an id outside that set is silently dropped
-- rather than trusted (a foreign key alone does not respect RLS).
create or replace function public.add_scheduled_activity_reflection(
  p_scheduled_activity_id uuid,
  p_reflection_card_id uuid,
  p_note text default null
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  select * into v_row
  from public.scheduled_activities
  where id = p_scheduled_activity_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.scheduled_activity_reflections (scheduled_activity_id, reflection_card_id, note_encrypted)
  select v_row.id, rc.id, internal.encrypt_reflection_note(nullif(btrim(p_note), ''))
  from public.reflection_cards rc
  where rc.id = p_reflection_card_id
    and (rc.created_by is null or rc.created_by = auth.uid())
  on conflict (scheduled_activity_id, reflection_card_id)
  do update set note_encrypted = excluded.note_encrypted;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- The inverse — drops one card's mapping only, leaving every other
-- reflection on the activity untouched.
create or replace function public.remove_scheduled_activity_reflection(
  p_scheduled_activity_id uuid,
  p_reflection_card_id uuid
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  select * into v_row
  from public.scheduled_activities
  where id = p_scheduled_activity_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  delete from public.scheduled_activity_reflections
  where scheduled_activity_id = v_row.id and reflection_card_id = p_reflection_card_id;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke all on function public.add_scheduled_activity_reflection(uuid, uuid, text) from public, anon;
revoke all on function public.remove_scheduled_activity_reflection(uuid, uuid) from public, anon;
grant execute on function public.add_scheduled_activity_reflection(uuid, uuid, text) to authenticated;
grant execute on function public.remove_scheduled_activity_reflection(uuid, uuid) to authenticated;
