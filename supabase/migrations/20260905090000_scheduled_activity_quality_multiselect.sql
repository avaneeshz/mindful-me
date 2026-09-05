-- SCRUM-10 — "Activity quality" is being fully replaced: the old 5-value
-- single-select vocabulary (Nourishing / Productive / Straining / Draining /
-- Dysregulated) is retired outright in favor of a brand-new 18-value
-- MULTI-select vocabulary (Resonance / Flow / Scattered / Overstimulated /
-- Zone out / Numb / Engaged / Bored / Resistant / Frozen / Avoiding /
-- Confusion / Compulsive persistent / Interoceptive Override / Addictive /
-- Nourishing / Draining / Energizing). This is a full vocabulary swap, not
-- an addition — the two labels that happen to survive (`Nourishing`,
-- `Draining`) are coincidental, not a preserved data mapping. No live
-- Supabase project has the single-select migration applied yet, so there is
-- no real historical data to migrate — this replaces the machinery outright
-- rather than attempting any lossy old-value -> new-value mapping.
--
-- Quality now mirrors `symptoms`' array-shaped encryption pattern exactly
-- (`text[]` in, comma-joined, one `bytea` blob out — see
-- `internal.encrypt_symptoms`/`internal.decrypt_symptoms` in
-- 20260904132230_scheduled_activity_symptoms_and_notes.sql) instead of its
-- own previous single-valued `text` in / `bytea` out shape. The Vault secret
-- (`scheduled_activities_quality_key`) and the `quality_encrypted bytea`
-- column are both reused as-is — same underlying storage, only what's
-- encrypted inside it changes shape. No new column, no new secret.
--
-- Postgres won't let two functions share a name and argument types but
-- differ only in return type, so `internal.decrypt_quality(bytea)` (today:
-- `returns text`) is explicitly dropped before the new `returns text[]`
-- version is created. `internal.encrypt_quality(text)` becomes dead once
-- nothing calls it any more, so it is dropped too rather than left as an
-- orphaned overload.
--
-- ORDER MATTERS here, more than in the two precedent migrations: `to_
-- scheduled_activity_dto` is a LANGUAGE SQL function (its body gets parsed
-- and its calls to `internal.decrypt_quality`/`decrypt_flags`/etc. recorded
-- as real pg_depend dependencies — unlike a plpgsql body, which is opaque
-- text with no such tracking). So the composite-type drop (which cascades
-- away `to_scheduled_activity_dto` itself, severing that dependency) has to
-- happen BEFORE `internal.decrypt_quality`/`encrypt_quality` are dropped —
-- otherwise the drop would fail with "cannot drop ... because other objects
-- depend on it". Every function that returns/depends on `scheduled_
-- activity_dto` is recreated below, once the type and the internal
-- encrypt/decrypt/validate functions it relies on are back in place: `to_
-- scheduled_activity_dto`, `list_scheduled_activities`, `create_scheduled_
-- activity`, `reschedule_scheduled_activity`, `set_scheduled_activity_
-- status`, `set_scheduled_activity_flags`, `set_scheduled_activity_quality`,
-- `set_scheduled_activity_symptoms`, `set_scheduled_activity_notes` and
-- `restore_scheduled_activity`. `soft_delete_scheduled_activity` returns
-- `void` and never touched the dto — left untouched.
--
-- Deliberately NOT touched: `log_scheduled_activity_event` / the audit
-- trigger, for the same reason both precedent migrations already documented
-- — `activity_events.payload` is plain, unencrypted `jsonb`, and no
-- rule-10-protected field belongs in it.

-- --- Step 1: drop the composite type (cascades away every function that
-- returns/depends on it — including the OLD internal.decrypt_quality
-- dependents — before we touch that function below). -----------------------
drop type if exists public.scheduled_activity_dto cascade;

-- --- Step 2: encrypt/decrypt, text -> text[] (mirrors encrypt_symptoms/
-- decrypt_symptoms exactly). Old single-valued overloads are safe to drop
-- now — nothing depends on them any more (see Step 1). ----------------------
drop function if exists internal.decrypt_quality(bytea);
drop function if exists internal.encrypt_quality(text);

create function internal.encrypt_quality(quality text[])
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when quality is null or array_length(quality, 1) is null then null
    else extensions.pgp_sym_encrypt(
      array_to_string(quality, ','),
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_quality_key')
    )
  end
$$;

create function internal.decrypt_quality(encrypted bytea)
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
        (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_quality_key')
      ),
      ','
    )
  end
$$;

revoke all on function internal.encrypt_quality(text[]) from public, anon, authenticated;
revoke all on function internal.decrypt_quality(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_quality(text[]) to authenticated, service_role;
grant execute on function internal.decrypt_quality(bytea) to authenticated, service_role;

-- The 18 allowed values (exact casing round-trips with the client's
-- `ActivityQuality` type in domain/types.ts), replacing the old 5-value
-- list entirely. Validated array-shaped, looping over each element — same
-- pattern `assert_valid_symptoms` already uses — since encrypted columns
-- can't carry a CHECK constraint that inspects the plaintext.
drop function if exists internal.assert_valid_quality(text);

create function internal.assert_valid_quality(quality text[])
returns void
language plpgsql
stable
set search_path = pg_temp
as $$
declare
  v_quality text;
begin
  if quality is null then
    return;
  end if;
  foreach v_quality in array quality loop
    if v_quality not in (
      'Resonance', 'Flow', 'Scattered', 'Overstimulated', 'Zone out', 'Numb',
      'Engaged', 'Bored', 'Resistant', 'Frozen', 'Avoiding', 'Confusion',
      'Compulsive persistent', 'Interoceptive Override', 'Addictive',
      'Nourishing', 'Draining', 'Energizing'
    ) then
      raise exception 'invalid_quality' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function internal.assert_valid_quality(text[]) from public, anon, authenticated;
grant execute on function internal.assert_valid_quality(text[]) to authenticated, service_role;

-- --- Step 3: recreate the composite type (quality now text[]) and every
-- function that depends on it, dropped in Step 1. --------------------------
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
  quality text[],
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  symptoms text[],
  notes text
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
    r.created_at, r.updated_at,
    internal.decrypt_symptoms(r.symptoms_encrypted), internal.decrypt_notes(r.notes_encrypted)
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

-- `p_quality` changes from `text default null` to `text[] default '{}'`,
-- matching `p_symptoms`'s own signature exactly — a parameter TYPE change,
-- so per this repo's own established convention this creates a new overload
-- (the old one was already removed by Step 1's cascade; the explicit drop
-- below is defensive, matching the precedent migrations' own belt-and-braces
-- style).
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
drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text, text[], text);

-- Same parameter-type change for reschedule's `p_quality` (old overload
-- already removed by Step 1's cascade; explicit drop below is defensive).
create or replace function public.reschedule_scheduled_activity(
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
drop function if exists public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text, text[], text);

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

-- `set_scheduled_activity_quality(uuid, text)` -> `(uuid, text[])`, same
-- drop-old/create-new treatment as everything else above, mirroring
-- `set_scheduled_activity_symptoms` exactly (old overload already removed
-- by Step 1's cascade; explicit drop below is defensive).
drop function if exists public.set_scheduled_activity_quality(uuid, text);

create function public.set_scheduled_activity_quality(
  p_id uuid,
  p_quality text[]
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

create or replace function public.set_scheduled_activity_symptoms(
  p_id uuid,
  p_symptoms text[]
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_symptoms(p_symptoms);

  update public.scheduled_activities set symptoms_encrypted = internal.encrypt_symptoms(p_symptoms)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_notes(
  p_id uuid,
  p_notes text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  update public.scheduled_activities set notes_encrypted = internal.encrypt_notes(p_notes)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
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
-- final hardened state every other RPC here already reached). `soft_delete_
-- scheduled_activity` is untouched by this migration (returns void, never
-- depended on the dto) so its existing grants are left exactly as they are.
revoke all on function public.set_scheduled_activity_status(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_flags(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_quality(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_symptoms(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_notes(uuid, text) from public, anon;
revoke all on function public.restore_scheduled_activity(uuid) from public, anon;
revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;

grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_quality(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_symptoms(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_notes(uuid, text) to authenticated;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;
