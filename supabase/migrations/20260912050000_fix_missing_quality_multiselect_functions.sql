-- Hotfix: finishes a migration that was written on 2026-09-05
-- (`20260905090000_scheduled_activity_quality_multiselect.sql`) but was
-- never actually applied to this database — confirmed via
-- `supabase_migrations.schema_migrations`, which has no record of that
-- version ever running. Every migration written after that date assumed it
-- HAD run: `create_scheduled_activity`/`reschedule_scheduled_activity`/etc.
-- were all correctly rebuilt (by later, real migrations) to take
-- `p_quality text[]`, and the `scheduled_activity_dto` composite type's
-- `quality` column is already `text[]` too — but the three lower-level
-- functions that actually validate/encrypt/decrypt quality were left behind
-- on their original 2026-08-29 single-value shape. The result: EVERY
-- `create_scheduled_activity`/`reschedule_scheduled_activity` call has been
-- failing outright (`internal.assert_valid_quality(text[]) does not exist`)
-- since whichever later migration first shipped the `text[]`-typed callers —
-- confirmed live, reproduced directly against production on 2026-09-12.
--
-- This migration does ONLY what the missed one should have done to
-- `internal.assert_valid_quality` / `internal.encrypt_quality` /
-- `internal.decrypt_quality` (single value -> array, matching
-- `assert_valid_symptoms`/`encrypt_symptoms`/`decrypt_symptoms`'s existing
-- shape exactly) — it changes nothing else. Everything that depends on the
-- `scheduled_activity_dto` composite type is recreated EXACTLY as it exists
-- in production today (verified via `pg_get_functiondef` against the live
-- database before writing this file) purely because dropping/recreating
-- `internal.decrypt_quality`'s return type forces the composite type to be
-- dropped and rebuilt, which cascades through everything that returns it —
-- not because any of those functions themselves needed to change. No grant
-- changes beyond restoring exactly what was already live.

-- --- Step 1: drop the composite type (cascades away every function that
-- returns it, including `to_scheduled_activity_dto` — the one function with
-- a real tracked dependency on `internal.decrypt_quality`, since it's a
-- LANGUAGE SQL function; see the 2026-09-05 migration's own note on why
-- this has to happen before Step 2). -----------------------------------------
drop type if exists public.scheduled_activity_dto cascade;

-- --- Step 2: the three quality functions, text -> text[] (mirrors
-- assert_valid_symptoms/encrypt_symptoms/decrypt_symptoms exactly). Old
-- single-valued overloads are safe to drop now — Step 1 already removed
-- their one real dependent. ---------------------------------------------
drop function if exists internal.decrypt_quality(bytea);
drop function if exists internal.encrypt_quality(text);
drop function if exists internal.assert_valid_quality(text);

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

revoke all on function internal.encrypt_quality(text[]) from public, anon, authenticated;
revoke all on function internal.decrypt_quality(bytea) from public, anon, authenticated;
revoke all on function internal.assert_valid_quality(text[]) from public, anon, authenticated;
grant execute on function internal.encrypt_quality(text[]) to authenticated, service_role;
grant execute on function internal.decrypt_quality(bytea) to authenticated, service_role;
grant execute on function internal.assert_valid_quality(text[]) to authenticated, service_role;

-- --- Step 3: recreate the composite type EXACTLY as it exists in
-- production today (same 16 columns, `reflections` included — that column
-- was added by a later, real migration, well after 2026-09-05). ------------
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
  notes text,
  reflections public.reflection_entry[]
);

-- --- Step 4: recreate every function Step 1 cascaded away, byte-for-byte
-- identical to what was live in production immediately before this
-- migration (pulled via pg_get_functiondef) — no behavioral change to any
-- of these, they only need to exist again. ----------------------------------
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
    internal.decrypt_symptoms(r.symptoms_encrypted), internal.decrypt_notes(r.notes_encrypted),
    (
      select coalesce(
        array_agg(
          row(sar.reflection_card_id, internal.decrypt_reflection_note(sar.note_encrypted))::public.reflection_entry
          order by sar.created_at
        ),
        array[]::public.reflection_entry[]
      )
      from public.scheduled_activity_reflections sar
      where sar.scheduled_activity_id = r.id
    )
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

create or replace function public.set_scheduled_activity_quality(
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

-- --- Step 5: grants, restored to exactly what was live before Step 1's
-- cascade removed them. -----------------------------------------------------
revoke all on function public.to_scheduled_activity_dto(public.scheduled_activities) from public;
grant execute on function public.to_scheduled_activity_dto(public.scheduled_activities) to anon, authenticated, service_role;

revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;

revoke all on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text) to authenticated;

revoke all on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text) from public, anon;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text) to authenticated;

revoke all on function public.set_scheduled_activity_status(uuid, text) from public, anon;
grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;

revoke all on function public.set_scheduled_activity_flags(uuid, text[]) from public, anon;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;

revoke all on function public.set_scheduled_activity_quality(uuid, text[]) from public, anon;
grant execute on function public.set_scheduled_activity_quality(uuid, text[]) to authenticated;

revoke all on function public.set_scheduled_activity_symptoms(uuid, text[]) from public, anon;
grant execute on function public.set_scheduled_activity_symptoms(uuid, text[]) to authenticated;

revoke all on function public.set_scheduled_activity_notes(uuid, text) from public, anon;
grant execute on function public.set_scheduled_activity_notes(uuid, text) to authenticated;

revoke all on function public.restore_scheduled_activity(uuid) from public, anon;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;

revoke all on function public.add_scheduled_activity_reflection(uuid, uuid, text) from public, anon;
grant execute on function public.add_scheduled_activity_reflection(uuid, uuid, text) to authenticated;

revoke all on function public.remove_scheduled_activity_reflection(uuid, uuid) from public, anon;
grant execute on function public.remove_scheduled_activity_reflection(uuid, uuid) to authenticated;
