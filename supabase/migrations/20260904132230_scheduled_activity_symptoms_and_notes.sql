-- "Chronic Symptoms" (multi-select) and "Notes" (freeform) — two new fields
-- on a logged activity, confirmed as part of the same product round that
-- introduced the real light/dark theme, the anchored tile panel, and the
-- simplified timeline. Rule 10 treats both exactly like `flags`/`quality` —
-- "similarly sensitive fields" — so both get the identical encrypted-at-rest
-- treatment: their own Vault secret, their own `internal`-schema (never
-- `public` — PostgREST doesn't expose that schema) SECURITY DEFINER
-- encrypt/decrypt pair, wired into `create_scheduled_activity`,
-- `reschedule_scheduled_activity`, and new standalone
-- `set_scheduled_activity_symptoms` / `set_scheduled_activity_notes`
-- setters mirroring `set_scheduled_activity_flags` / `_quality`.
--
-- Symptoms is multi-select (any number of the 6 values at once), so unlike
-- `quality` — which deliberately mirrors flags' PATTERN but not its
-- ARRAY SIGNATURE, since quality is genuinely single-valued — symptoms
-- mirrors flags' ORIGINAL shape exactly: `text[]` in, one `bytea` blob out,
-- comma-joined before encryption, same as `encrypt_flags`/`decrypt_flags`.
-- Notes is freeform text, so its encrypt/decrypt pair mirrors quality's
-- `text` in / `bytea` out shape instead — there is no fixed set of allowed
-- values to validate, so (unlike symptoms) there is no `assert_valid_notes`.
--
-- Every function below that returns/depends on `scheduled_activity_dto` has
-- to be recreated in this one migration, because adding attributes means
-- dropping and recreating the composite type (matching this repo's own
-- established precedent, twice now) — the drop cascades through every
-- dependent function's return type.
--
-- Deliberately NOT touched: `log_scheduled_activity_event` / the audit
-- trigger. `activity_events.payload` is plain, unencrypted `jsonb` — writing
-- symptoms or notes into it would leak a rule-10-protected field in
-- plaintext right next to the encrypted column meant to protect it. No event
-- payload anywhere gains a symptoms or notes field.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activities_symptoms_key',
  'Symmetric key for encrypting scheduled_activities.symptoms_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activities_symptoms_key'
);

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activities_notes_key',
  'Symmetric key for encrypting scheduled_activities.notes_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activities_notes_key'
);

create function internal.encrypt_symptoms(symptoms text[])
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when symptoms is null or array_length(symptoms, 1) is null then null
    else extensions.pgp_sym_encrypt(
      array_to_string(symptoms, ','),
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_symptoms_key')
    )
  end
$$;

create function internal.decrypt_symptoms(encrypted bytea)
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
        (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_symptoms_key')
      ),
      ','
    )
  end
$$;

create function internal.encrypt_notes(notes text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when notes is null or notes = '' then null
    else extensions.pgp_sym_encrypt(
      notes,
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_notes_key')
    )
  end
$$;

create function internal.decrypt_notes(encrypted bytea)
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
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_notes_key')
    )
  end
$$;

revoke all on function internal.encrypt_symptoms(text[]) from public, anon, authenticated;
revoke all on function internal.decrypt_symptoms(bytea) from public, anon, authenticated;
revoke all on function internal.encrypt_notes(text) from public, anon, authenticated;
revoke all on function internal.decrypt_notes(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_symptoms(text[]) to authenticated, service_role;
grant execute on function internal.decrypt_symptoms(bytea) to authenticated, service_role;
grant execute on function internal.encrypt_notes(text) to authenticated, service_role;
grant execute on function internal.decrypt_notes(bytea) to authenticated, service_role;

-- The 6 allowed values (exact casing round-trips with the client's
-- `Symptom` type in domain/types.ts). Encrypted columns can't carry a CHECK
-- constraint that inspects the plaintext, so this validates every element
-- inside every RPC that accepts `p_symptoms`, before encrypting — same
-- pattern `assert_valid_quality` already uses, generalized to an array.
create function internal.assert_valid_symptoms(symptoms text[])
returns void
language plpgsql
stable
set search_path = pg_temp
as $$
declare
  v_symptom text;
begin
  if symptoms is null then
    return;
  end if;
  foreach v_symptom in array symptoms loop
    if v_symptom not in (
      'Pitta', 'Inflammation', 'Right knee pain', 'Calves pain', 'Temporal pain', 'Dryness'
    ) then
      raise exception 'invalid_symptom' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function internal.assert_valid_symptoms(text[]) from public, anon, authenticated;
grant execute on function internal.assert_valid_symptoms(text[]) to authenticated, service_role;

alter table public.scheduled_activities add column symptoms_encrypted bytea;
alter table public.scheduled_activities add column notes_encrypted bytea;

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

-- `p_symptoms`/`p_notes` appended at the end (after the existing trailing
-- `p_quality`) so every existing NAMED-parameter call site (the client
-- always calls RPCs with named params, never positional) keeps working
-- unchanged for anything that doesn't pass them. `create or replace` cannot
-- alter a parameter list in place — this creates a new 12-arg overload — so
-- the old 10-arg one is explicitly dropped below, exactly like `p_quality`
-- was added previously.
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
  p_quality text default null,
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

revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text, text[], text) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text, text[], text) to authenticated;
drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text);

-- Symptoms and notes ride along in reschedule too, exactly like quality
-- (unlike flags, which deliberately stay OUT of reschedule per the earlier
-- approved decision): the modal edits duration/time, quality, symptoms and
-- notes together in one Save, so the client always sends the FULL current
-- value of each on every reschedule call, never omitted, and this
-- unconditionally overwrites them — the same "caller always sends the
-- authoritative full value" contract every other bundled column here has.
create or replace function public.reschedule_scheduled_activity(
  p_id uuid,
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_quality text default null,
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

revoke execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text, text[], text) from public, anon;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text, text[], text) to authenticated;
drop function if exists public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text);

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

-- New — mirrors `set_scheduled_activity_flags` exactly, for a
-- symptoms-only edit with no accompanying time change (parity/future use,
-- same as `set_scheduled_activity_quality`; the client's modal always
-- bundles symptoms into create/reschedule when saving the whole entry).
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

-- New — mirrors `set_scheduled_activity_quality` exactly, for a
-- notes-only edit with no accompanying time change (parity/future use).
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
revoke all on function public.set_scheduled_activity_symptoms(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_notes(uuid, text) from public, anon;
revoke all on function public.soft_delete_scheduled_activity(uuid) from public, anon;
revoke all on function public.restore_scheduled_activity(uuid) from public, anon;
revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;

grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_quality(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_symptoms(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_notes(uuid, text) to authenticated;
grant execute on function public.soft_delete_scheduled_activity(uuid) to authenticated;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;
