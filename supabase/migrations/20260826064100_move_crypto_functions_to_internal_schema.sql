-- Coordinator-verified gap (found via get_advisors security scan after
-- Phase 2/3 landed): encrypt_flags/decrypt_flags lived in `public`, which
-- PostgREST exposes as an API — so despite SECURITY DEFINER being scoped
-- narrowly to resolving the Vault key, any authenticated session (this
-- project uses anonymous auth, so effectively any signed-in device) could
-- call /rest/v1/rpc/decrypt_flags directly, bypassing every ownership/
-- ceiling check the higher-level RPCs perform before ever touching a flag.
--
-- Revoking `authenticated`'s EXECUTE outright (tried and reverted live
-- against the project before this migration, net no-op) breaks create/
-- list/reschedule/set_flags, which are SECURITY INVOKER and so call these
-- AS the authenticated caller, not as the function owner.
--
-- The correct fix: move both functions to a schema PostgREST does not
-- expose (`internal`), so they are simply unreachable at /rest/v1/rpc/...
-- regardless of grants, while keeping `authenticated`'s EXECUTE so the
-- SECURITY INVOKER callers can still reach them internally.
create schema if not exists internal;
revoke all on schema internal from public, anon;
grant usage on schema internal to authenticated, service_role;

create function internal.encrypt_flags(flags text[])
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when flags is null or array_length(flags, 1) is null then null
    else extensions.pgp_sym_encrypt(
      array_to_string(flags, ','),
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_flags_key')
    )
  end
$$;

create function internal.decrypt_flags(encrypted bytea)
returns text[]
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then '{}'::text[]
    else string_to_array(
      extensions.pgp_sym_decrypt(
        encrypted,
        (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_flags_key')
      ),
      ','
    )
  end
$$;

revoke all on function internal.encrypt_flags(text[]) from public, anon, authenticated;
revoke all on function internal.decrypt_flags(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_flags(text[]) to authenticated, service_role;
grant execute on function internal.decrypt_flags(bytea) to authenticated, service_role;

-- Repoint every caller at the new location. Same signatures, same bodies,
-- only the encrypt_flags/decrypt_flags call sites changed.
create or replace function public.to_scheduled_activity_dto(r public.scheduled_activities)
returns public.scheduled_activity_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(
    r.id, r.activity_id, r.path, r.start_at, r.duration_minutes, r.local_date,
    r.start_minute, r.timezone, internal.decrypt_flags(r.flags_encrypted), r.status,
    r.created_at, r.updated_at
  )::public.scheduled_activity_dto
$$;

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
    p_local_date, p_start_minute, p_timezone, internal.encrypt_flags(p_flags), 'planned'
  )
  on conflict (id) do update set
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
  update public.scheduled_activities set flags_encrypted = internal.encrypt_flags(p_flags)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- Now safe to drop the old public-schema (API-exposed) versions — nothing
-- references them any more.
drop function if exists public.encrypt_flags(text[]);
drop function if exists public.decrypt_flags(bytea);
