-- Local-first write (rule 6): the client mints a UUID for a new activity the
-- instant it is created, offline-safe, and that id must survive the trip to
-- the server unchanged — otherwise the client and server disagree about an
-- activity's identity the moment it syncs, breaking undo/restore, which acts
-- on a specific id. `p_id` lets the client supply that id; the server still
-- mints one itself (as before) if it is omitted.
create or replace function public.create_scheduled_activity(
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_flags text[] default '{}',
  p_id uuid default null
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

  if p_duration_minutes > 0 then
    v_ceiling := public.scheduling_ceiling(auth.uid(), p_start_at, null);
    if p_duration_minutes > v_ceiling then
      raise exception 'schedule_conflict: % minutes requested, % available', p_duration_minutes, v_ceiling
        using errcode = 'P0001', detail = v_ceiling::text;
    end if;
  end if;

  insert into public.scheduled_activities (
    id, user_id, activity_id, path, start_at, end_at, duration_minutes,
    local_date, start_minute, timezone, flags_encrypted, status
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_activity_id, coalesce(p_path, '{}'), p_start_at,
    p_start_at + make_interval(mins => p_duration_minutes), p_duration_minutes,
    p_local_date, p_start_minute, p_timezone, public.encrypt_flags(p_flags), 'planned'
  )
  on conflict (id) do update set
    -- Idempotent retry (rule 6's background sync may resend the same create
    -- after a dropped connection): re-applying identical values is a no-op;
    -- this is not a way to silently overwrite a genuinely different row,
    -- since `id` is a client-minted UUID the client only ever reuses for
    -- retrying its OWN prior request.
    activity_id = excluded.activity_id,
    path = excluded.path,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    duration_minutes = excluded.duration_minutes,
    local_date = excluded.local_date,
    start_minute = excluded.start_minute,
    timezone = excluded.timezone,
    flags_encrypted = excluded.flags_encrypted
  where public.scheduled_activities.user_id = auth.uid()
  returning * into v_row;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid) to authenticated;

-- `create or replace` cannot change a function's parameter list in place, so
-- the previous 8-argument overload (before `p_id`) is still sitting there
-- unused. Drop it — there should be exactly one `create_scheduled_activity`.
drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[]);
