-- The Sleep quick-log button's two extra fields, beyond the type (stored in
-- `path`, same as every other sub-having card) and the generic freeform
-- `notes` every activity already has:
--
--   - "How was your sleep?" — an 11-value MULTI-select, deliberately a
--     DIFFERENT vocabulary from the existing 18-value `ActivityQuality`
--     ("Activity quality") used everywhere else. Conflating the two would
--     mean either polluting the general quality picker with sleep-only
--     values it makes no sense to offer on, say, a Work Deep session, or
--     silently reinterpreting a subset of the existing 18 as sleep-specific
--     — both worse than a clean second field. So this is a genuinely new
--     column, `sleep_quality_encrypted`, encrypted the same array-shaped way
--     `quality_encrypted`/`symptoms_encrypted` already are (rule 10) — same
--     Vault-secret-per-column, `internal`-schema SECURITY DEFINER
--     encrypt/decrypt/assert-valid trio, `text[]` in, comma-joined, one
--     `bytea` blob out.
--   - "Dreams" — a SEPARATE freeform note from the generic `notes` field
--     (the product spec is explicit: "TWO separate note fields, not one").
--     `dreams_encrypted` mirrors `notes_encrypted` exactly (a single
--     freeform `text` in / `bytea` out, own Vault secret).
--
-- Both columns live on `scheduled_activities` itself (not a child table —
-- there is no per-pairing/many-valued shape here the way reflections
-- needed one) and are present on EVERY row, exactly like
-- flags/quality/symptoms/notes already are, even though in practice only a
-- 'Sleep'-named activity ever populates them — the client gates the UI for
-- these fields to `staging.cardName === 'Sleep'`, not the schema.
--
-- Same "drop composite type -> recreate every dependent function" mechanics
-- as every precedent migration in this file group (reflections/quality/
-- symptoms/notes) — see 20260910120000_scheduled_activity_reflections.sql's
-- own comment on why LANGUAGE SQL bodies force this ordering.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activities_sleep_quality_key',
  'Symmetric key for encrypting scheduled_activities.sleep_quality_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activities_sleep_quality_key'
);

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activities_dreams_key',
  'Symmetric key for encrypting scheduled_activities.dreams_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activities_dreams_key'
);

-- --- Step 1: drop the composite type (cascades away every function that
-- returns/depends on it). ---------------------------------------------------
drop type if exists public.scheduled_activity_dto cascade;

-- --- Step 2: the new columns + their encrypt/decrypt/validate trio. --------
alter table public.scheduled_activities
  add column sleep_quality_encrypted bytea,
  add column dreams_encrypted bytea;

create function internal.encrypt_sleep_quality(sleep_quality text[])
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when sleep_quality is null or array_length(sleep_quality, 1) is null then null
    else extensions.pgp_sym_encrypt(
      array_to_string(sleep_quality, ','),
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_sleep_quality_key')
    )
  end
$$;

create function internal.decrypt_sleep_quality(encrypted bytea)
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
        (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_sleep_quality_key')
      ),
      ','
    )
  end
$$;

revoke all on function internal.encrypt_sleep_quality(text[]) from public, anon, authenticated;
revoke all on function internal.decrypt_sleep_quality(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_sleep_quality(text[]) to authenticated, service_role;
grant execute on function internal.decrypt_sleep_quality(bytea) to authenticated, service_role;

-- The 11 allowed values (exact casing round-trips with the client's
-- `SleepQualityId` type in domain/types.ts). Same "loop over each element"
-- shape `assert_valid_quality`/`assert_valid_symptoms` already use.
create function internal.assert_valid_sleep_quality(sleep_quality text[])
returns void
language plpgsql
stable
set search_path = pg_temp
as $$
declare
  v_value text;
begin
  if sleep_quality is null then
    return;
  end if;
  foreach v_value in array sleep_quality loop
    if v_value not in (
      'Deep Restorative', 'Light & Restful', 'Light & Restless', 'Fragmented',
      'Interrupted', 'Long but Unrefreshing', 'Short but Restorative',
      'Dream-Intense', 'Delayed', 'Early Awakening', 'Unusually Deep'
    ) then
      raise exception 'invalid_sleep_quality' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function internal.assert_valid_sleep_quality(text[]) from public, anon, authenticated;
grant execute on function internal.assert_valid_sleep_quality(text[]) to authenticated, service_role;

create function internal.encrypt_dreams(dreams_text text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when dreams_text is null or dreams_text = '' then null
    else extensions.pgp_sym_encrypt(
      dreams_text,
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_dreams_key')
    )
  end
$$;

create function internal.decrypt_dreams(encrypted bytea)
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
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_dreams_key')
    )
  end
$$;

revoke all on function internal.encrypt_dreams(text) from public, anon, authenticated;
revoke all on function internal.decrypt_dreams(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_dreams(text) to authenticated, service_role;
grant execute on function internal.decrypt_dreams(bytea) to authenticated, service_role;

-- --- Step 3: recreate the composite type (2 new trailing fields) and every
-- function that depends on it. ----------------------------------------------
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
  reflections public.reflection_entry[],
  sleep_quality text[],
  dreams text
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
    ),
    internal.decrypt_sleep_quality(r.sleep_quality_encrypted),
    internal.decrypt_dreams(r.dreams_encrypted)
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

-- `p_sleep_quality`/`p_dreams` appended at the end (after the existing
-- trailing `p_reflections`), same convention every previous field addition
-- has followed — every existing NAMED-parameter call site keeps working
-- unchanged for anything that doesn't pass them.
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
  p_notes text default null,
  p_reflections jsonb default '[]'::jsonb,
  p_sleep_quality text[] default '{}',
  p_dreams text default null
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
  perform internal.assert_valid_sleep_quality(p_sleep_quality);

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
    symptoms_encrypted, notes_encrypted, sleep_quality_encrypted, dreams_encrypted
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_activity_id, coalesce(p_path, '{}'), p_start_at,
    p_start_at + make_interval(mins => p_duration_minutes), p_duration_minutes,
    p_local_date, p_start_minute, p_timezone, internal.encrypt_flags(p_flags),
    internal.encrypt_quality(p_quality), 'planned',
    internal.encrypt_symptoms(p_symptoms), internal.encrypt_notes(p_notes),
    internal.encrypt_sleep_quality(p_sleep_quality), internal.encrypt_dreams(p_dreams)
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
    notes_encrypted = excluded.notes_encrypted,
    sleep_quality_encrypted = excluded.sleep_quality_encrypted,
    dreams_encrypted = excluded.dreams_encrypted
  where public.scheduled_activities.user_id = auth.uid()
  returning * into v_row;

  delete from public.scheduled_activity_reflections where scheduled_activity_id = v_row.id;
  insert into public.scheduled_activity_reflections (scheduled_activity_id, reflection_card_id, note_encrypted)
  select
    v_row.id,
    rc.id,
    internal.encrypt_reflection_note(nullif(btrim(elem ->> 'note'), ''))
  from jsonb_array_elements(coalesce(p_reflections, '[]'::jsonb)) as elem
  join public.reflection_cards rc
    on rc.id = (elem ->> 'card_id')::uuid
   and (rc.created_by is null or rc.created_by = auth.uid());

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb, text[], text) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb, text[], text) to authenticated;
drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb);

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
  p_notes text default null,
  p_reflections jsonb default '[]'::jsonb,
  p_sleep_quality text[] default '{}',
  p_dreams text default null
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
  perform internal.assert_valid_sleep_quality(p_sleep_quality);

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
    notes_encrypted = internal.encrypt_notes(p_notes),
    sleep_quality_encrypted = internal.encrypt_sleep_quality(p_sleep_quality),
    dreams_encrypted = internal.encrypt_dreams(p_dreams)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  delete from public.scheduled_activity_reflections where scheduled_activity_id = v_row.id;
  insert into public.scheduled_activity_reflections (scheduled_activity_id, reflection_card_id, note_encrypted)
  select
    v_row.id,
    rc.id,
    internal.encrypt_reflection_note(nullif(btrim(elem ->> 'note'), ''))
  from jsonb_array_elements(coalesce(p_reflections, '[]'::jsonb)) as elem
  join public.reflection_cards rc
    on rc.id = (elem ->> 'card_id')::uuid
   and (rc.created_by is null or rc.created_by = auth.uid());

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb, text[], text) from public, anon;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb, text[], text) to authenticated;
drop function if exists public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb);

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

create or replace function public.set_scheduled_activity_reflections(
  p_id uuid,
  p_reflections jsonb
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  select * into v_row
  from public.scheduled_activities
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  delete from public.scheduled_activity_reflections where scheduled_activity_id = v_row.id;
  insert into public.scheduled_activity_reflections (scheduled_activity_id, reflection_card_id, note_encrypted)
  select
    v_row.id,
    rc.id,
    internal.encrypt_reflection_note(nullif(btrim(elem ->> 'note'), ''))
  from jsonb_array_elements(coalesce(p_reflections, '[]'::jsonb)) as elem
  join public.reflection_cards rc
    on rc.id = (elem ->> 'card_id')::uuid
   and (rc.created_by is null or rc.created_by = auth.uid());

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- New — parity with `set_scheduled_activity_quality`/`set_scheduled_
-- activity_symptoms` for a sleep-quality-only edit with no accompanying
-- time change. The client's modal always bundles both new fields into
-- create/reschedule when saving the whole Sleep entry; these two are for
-- parity/future use, same as every other standalone field setter here.
create or replace function public.set_scheduled_activity_sleep_quality(
  p_id uuid,
  p_sleep_quality text[]
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_sleep_quality(p_sleep_quality);

  update public.scheduled_activities set sleep_quality_encrypted = internal.encrypt_sleep_quality(p_sleep_quality)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_dreams(
  p_id uuid,
  p_dreams text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  update public.scheduled_activities set dreams_encrypted = internal.encrypt_dreams(p_dreams)
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

revoke all on function public.set_scheduled_activity_status(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_flags(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_quality(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_symptoms(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_notes(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_reflections(uuid, jsonb) from public, anon;
revoke all on function public.set_scheduled_activity_sleep_quality(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_dreams(uuid, text) from public, anon;
revoke all on function public.restore_scheduled_activity(uuid) from public, anon;
revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;

grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_quality(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_symptoms(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_notes(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_reflections(uuid, jsonb) to authenticated;
grant execute on function public.set_scheduled_activity_sleep_quality(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_dreams(uuid, text) to authenticated;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;
