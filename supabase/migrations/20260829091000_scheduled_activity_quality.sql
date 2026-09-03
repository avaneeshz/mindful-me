-- "How did it feel?" (Tile Redesign modal, item 4) — a single-select,
-- nullable reflection on a logged activity: Nourishing / Productive /
-- Straining / Draining / Dysregulated. Rule 10 treats this exactly like
-- `flags` — a "similarly sensitive field" — so it gets the identical
-- encrypted-at-rest treatment `flags_encrypted`/`encrypt_flags`/
-- `decrypt_flags` already established: its own Vault secret, its own
-- `internal`-schema (never `public` — PostgREST doesn't expose that schema,
-- so there's no public-schema-then-lock-down detour to repeat) SECURITY
-- DEFINER encrypt/decrypt pair, wired into `create_scheduled_activity`,
-- `reschedule_scheduled_activity`, and a new standalone
-- `set_scheduled_activity_quality` mirroring `set_scheduled_activity_flags`.
--
-- Unlike flags (`text[]`, left exactly as-is per the approved decision —
-- single-select is enforced client-side only, never a DB shape change),
-- quality is genuinely single-valued, so its encrypt/decrypt pair mirrors
-- the PATTERN, not the array-shaped SIGNATURE: `text` in, `bytea` out.
--
-- Every function below that returns/depends on `scheduled_activity_dto`
-- has to be recreated in this one migration, because adding an attribute
-- means dropping and recreating the composite type (matching this repo's
-- own established precedent from the original scheduling_api migration,
-- preferred over `ALTER TYPE ... ADD ATTRIBUTE` for consistency) — the drop
-- cascades through every dependent function's return type.
--
-- Deliberately NOT touched: `log_scheduled_activity_event` / the audit
-- trigger. `activity_events.payload` is plain, unencrypted `jsonb` — writing
-- quality (or flags) into it would leak a rule-10-protected field in
-- plaintext right next to the encrypted column meant to protect it. No
-- event payload anywhere gains a quality or flags field.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activities_quality_key',
  'Symmetric key for encrypting scheduled_activities.quality_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activities_quality_key'
);

create function internal.encrypt_quality(quality text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when quality is null then null
    else extensions.pgp_sym_encrypt(
      quality,
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_quality_key')
    )
  end
$$;

create function internal.decrypt_quality(encrypted bytea)
returns text
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then null
    else extensions.pgp_sym_decrypt(
      encrypted,
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_quality_key')
    )
  end
$$;

revoke all on function internal.encrypt_quality(text) from public, anon, authenticated;
revoke all on function internal.decrypt_quality(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_quality(text) to authenticated, service_role;
grant execute on function internal.decrypt_quality(bytea) to authenticated, service_role;

-- The 5 allowed values (exact casing round-trips with the client's
-- `ActivityQuality` type in domain/types.ts). Encrypted columns can't carry
-- a CHECK constraint that inspects the plaintext, so this validates inside
-- every RPC that accepts `p_quality`, before encrypting — the same pattern
-- `set_scheduled_activity_status` already uses for `status in (...)`.
create function internal.assert_valid_quality(quality text)
returns void
language plpgsql
stable
set search_path = pg_temp
as $$
begin
  if quality is not null and quality not in (
    'Nourishing', 'Productive', 'Straining', 'Draining', 'Dysregulated'
  ) then
    raise exception 'invalid_quality' using errcode = '22023';
  end if;
end;
$$;

revoke all on function internal.assert_valid_quality(text) from public, anon, authenticated;
grant execute on function internal.assert_valid_quality(text) to authenticated, service_role;

alter table public.scheduled_activities add column quality_encrypted bytea;

-- --- Composite type: drop + recreate (cascades through every dependent
-- function's return type — all recreated below). ---------------------------
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
  quality text,
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
    r.start_minute, r.timezone, internal.decrypt_flags(r.flags_encrypted),
    internal.decrypt_quality(r.quality_encrypted), r.status,
    r.created_at, r.updated_at
  )::public.scheduled_activity_dto
$$;

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

-- `p_quality` appended at the end (after the existing trailing `p_id`) so
-- every existing NAMED-parameter call site (the client always calls RPCs
-- with named params, never positional) keeps working unchanged for anything
-- that doesn't pass it. `create or replace` cannot alter a parameter list in
-- place — this creates a new 10-arg overload — so the old 9-arg one is
-- explicitly dropped below, exactly like `p_id` was added previously.
create or replace function public.create_scheduled_activity(
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_flags text[] default '{}',
  p_id uuid default null,
  p_quality text default null
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

  if p_duration_minutes > 0 then
    v_ceiling := public.scheduling_ceiling(auth.uid(), p_start_at, null);
    if p_duration_minutes > v_ceiling then
      raise exception 'schedule_conflict: % minutes requested, % available', p_duration_minutes, v_ceiling
        using errcode = 'P0001', detail = v_ceiling::text;
    end if;
  end if;

  insert into public.scheduled_activities (
    id, user_id, activity_id, path, start_at, end_at, duration_minutes,
    local_date, start_minute, timezone, flags_encrypted, quality_encrypted, status
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_activity_id, coalesce(p_path, '{}'), p_start_at,
    p_start_at + make_interval(mins => p_duration_minutes), p_duration_minutes,
    p_local_date, p_start_minute, p_timezone, internal.encrypt_flags(p_flags),
    internal.encrypt_quality(p_quality), 'planned'
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
    quality_encrypted = excluded.quality_encrypted
  where public.scheduled_activities.user_id = auth.uid()
  returning * into v_row;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text) to authenticated;
drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid);

-- Reschedule gains `p_quality` too (unlike flags, which stay OUT of
-- reschedule per the approved decision — this is a deliberate asymmetry,
-- not an oversight: the new modal edits duration/time and quality together
-- in one Save, so the client always sends the FULL current quality value on
-- every reschedule call, never omitted, and this unconditionally overwrites
-- it — the same "caller always sends the authoritative full value" contract
-- every other column here already has. Flags stay on their own standalone
-- `set_scheduled_activity_flags` call instead (unchanged). Status still has
-- no parameter here at all — rule 4 holds exactly as before.
create or replace function public.reschedule_scheduled_activity(
  p_id uuid,
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_quality text default null
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_quality(p_quality);

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
    quality_encrypted = internal.encrypt_quality(p_quality)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text) from public, anon;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text) to authenticated;
drop function if exists public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text);

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
  update public.scheduled_activities set flags_encrypted = internal.encrypt_flags(p_flags)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- New — mirrors `set_scheduled_activity_flags` exactly, for a quality-only
-- edit with no accompanying time change (the client's modal always bundles
-- quality into reschedule when time is ALSO being saved; this standalone
-- setter exists for parity/future use, same as instructed).
create or replace function public.set_scheduled_activity_quality(
  p_id uuid,
  p_quality text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_quality(p_quality);

  update public.scheduled_activities set quality_encrypted = internal.encrypt_quality(p_quality)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

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
  update public.scheduled_activities set deleted_at = null
  where id = p_id and user_id = auth.uid() and deleted_at is not null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- Grants: locked down from the start (authenticated only, matching the
-- final hardened state every other RPC here already reached).
revoke all on function public.set_scheduled_activity_status(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_flags(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_quality(uuid, text) from public, anon;
revoke all on function public.soft_delete_scheduled_activity(uuid) from public, anon;
revoke all on function public.restore_scheduled_activity(uuid) from public, anon;
revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;

grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_quality(uuid, text) to authenticated;
grant execute on function public.soft_delete_scheduled_activity(uuid) to authenticated;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;
