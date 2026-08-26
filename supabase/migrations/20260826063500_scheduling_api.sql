-- Phase 2: the API layer the client's shared scheduling module
-- (app/src/domain/scheduling.ts) talks to. Every RPC here runs as the
-- calling user (SECURITY INVOKER, the default) so row-level security is
-- always the real enforcement boundary — these functions are a convenience
-- and validation layer over it, never a way around it. `encrypt_flags` /
-- `decrypt_flags` (SECURITY DEFINER, previous migration) are the one
-- exception, scoped narrowly to resolving the Vault key.
--
-- `scheduling_ceiling` mirrors `maxContiguousDuration` in
-- domain/scheduling.ts exactly: 0 when the requested instant is already
-- occupied, otherwise the gap until the next activity (or a generous cap
-- when nothing follows) — never a hint to split across two gaps (rule 13).
-- The `no_overlapping_activities` exclusion constraint is still the actual
-- backstop; this just lets a rejected request come back with a useful
-- "here's how much room there really is" instead of a bare constraint error.
create or replace function public.scheduling_ceiling(
  p_user_id uuid,
  p_start_at timestamptz,
  p_exclude_id uuid default null
) returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1 from public.scheduled_activities s
      where s.user_id = p_user_id
        and s.deleted_at is null
        and s.duration_minutes > 0
        and s.id is distinct from p_exclude_id
        and s.start_at <= p_start_at and p_start_at < s.end_at
    ) then 0
    else coalesce(
      (
        select floor(extract(epoch from (min(s.start_at) - p_start_at)) / 60)::int
        from public.scheduled_activities s
        where s.user_id = p_user_id
          and s.deleted_at is null
          and s.duration_minutes > 0
          and s.id is distinct from p_exclude_id
          and s.start_at >= p_start_at
      ),
      30 * 24 * 60 -- nothing later exists; a generous cap, not a real limit
    )
  end
$$;

-- The composite shape every RPC below hands back to the client — the same
-- fields as the Phase-1 client `ScheduledActivity`, flags already decrypted.
drop type if exists public.scheduled_activity_dto cascade;
create type public.scheduled_activity_dto as (
  id uuid,
  activity_id uuid,
  path text[],
  start_at timestamptz,
  duration_minutes integer,
  local_date date,
  start_minute smallint,
  timezone text,
  flags text[],
  status text,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function public.to_scheduled_activity_dto(r public.scheduled_activities)
returns public.scheduled_activity_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(
    r.id, r.activity_id, r.path, r.start_at, r.duration_minutes, r.local_date,
    r.start_minute, r.timezone, public.decrypt_flags(r.flags_encrypted), r.status,
    r.created_at, r.updated_at
  )::public.scheduled_activity_dto
$$;

-- Rule 8: the one read path — always scoped to a window, never the user's
-- full history. `[p_range_start, p_range_end)` is expected to be "today" or
-- "this week" in the caller's local time, converted to real instants.
create or replace function public.list_scheduled_activities(
  p_range_start timestamptz,
  p_range_end timestamptz
) returns setof public.scheduled_activity_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_scheduled_activity_dto(s)
  from public.scheduled_activities s
  where s.user_id = auth.uid()
    and s.deleted_at is null
    and s.start_at < p_range_end
    and s.end_at > p_range_start
  order by s.start_at;
$$;

create or replace function public.create_scheduled_activity(
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_flags text[] default '{}'
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
    user_id, activity_id, path, start_at, end_at, duration_minutes,
    local_date, start_minute, timezone, flags_encrypted, status
  ) values (
    auth.uid(), p_activity_id, coalesce(p_path, '{}'), p_start_at,
    p_start_at + make_interval(mins => p_duration_minutes), p_duration_minutes,
    p_local_date, p_start_minute, p_timezone, public.encrypt_flags(p_flags), 'planned'
  ) returning * into v_row;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- Reschedule ONLY moves time/duration (and, for a real activity, which
-- catalog entry/path it names) — it deliberately has no status or flags
-- parameter at all, so rule 4 ("editing time/duration never silently clears
-- completion") holds structurally: there is no code path here that could
-- even accidentally touch either.
create or replace function public.reschedule_scheduled_activity(
  p_id uuid,
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
begin
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
    timezone = p_timezone
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_status(
  p_id uuid,
  p_status text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  if p_status not in ('planned', 'completed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.scheduled_activities set status = p_status
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_flags(
  p_id uuid,
  p_flags text[]
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  update public.scheduled_activities set flags_encrypted = public.encrypt_flags(p_flags)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- Rule 11 — immediate from the user's view (excluded by the select RLS
-- policy the instant deleted_at is set, and its time is freed immediately
-- since the exclusion constraint's predicate also requires deleted_at is
-- null), recoverable for 30 days (restore below), then purged by the daily
-- cron job in the previous migration.
create or replace function public.soft_delete_scheduled_activity(p_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.scheduled_activities set deleted_at = now()
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_scheduled_activity(p_id uuid)
returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  -- If the freed time has since been taken by something else, the
  -- `no_overlapping_activities` exclusion constraint rejects this UPDATE
  -- outright (raised as a unique_violation-style error) — restoring is
  -- never the one path allowed to reintroduce an overlap.
  update public.scheduled_activities set deleted_at = null
  where id = p_id and user_id = auth.uid() and deleted_at is not null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke all on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[]) from public;
revoke all on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text) from public;
revoke all on function public.set_scheduled_activity_status(uuid, text) from public;
revoke all on function public.set_scheduled_activity_flags(uuid, text[]) from public;
revoke all on function public.soft_delete_scheduled_activity(uuid) from public;
revoke all on function public.restore_scheduled_activity(uuid) from public;
revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public;
revoke all on function public.scheduling_ceiling(uuid, timestamptz, uuid) from public;

grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[]) to authenticated;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text) to authenticated;
grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;
grant execute on function public.soft_delete_scheduled_activity(uuid) to authenticated;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;
grant execute on function public.scheduling_ceiling(uuid, timestamptz, uuid) to authenticated;
