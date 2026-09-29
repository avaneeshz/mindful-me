-- PICKER-CUSTOM-1, part 4: moves quality/symptoms/flags validation off the
-- hardcoded global `IN (...)` lists (`internal.assert_valid_quality`/
-- `assert_valid_symptoms`) and onto `internal.effective_parameter_options`
-- (previous migration), scoped per-activity + per-user — the same kind of
-- transformation `20260921060000_dynamic_note_fields.sql` already did once
-- for `note_entries`/`daily_values`/`supplement_completions` validation
-- against `header_buttons`. Flags get an equivalent function for the first
-- time (`internal.assert_valid_flags`) — there was no server-side flags
-- validation at all before this (`create_scheduled_activity` never called
-- one), only the client's fixed 14-value `FlagId` union.
--
-- Rule 12 hardening (flagged as a deliberate improvement, not scope creep):
-- "editing a past day is always allowed... validation only gates NEW
-- writes, never invalidates already-stored history." With a fixed global
-- vocabulary that never lost values, a stale-value-on-resave problem barely
-- existed in practice. Once OPTIONS ARE USER-EDITABLE, a plain resave of an
-- old day (e.g. only nudging its duration) can very easily hit a label the
-- user has since renamed or deleted from that activity's list — the existing
-- `assert_valid_*` call pattern (re-validates the FULL array on every write,
-- unconditionally) would then block an edit rule 12 says must always be
-- allowed. Fixed here: every `assert_valid_*` call now also receives the
-- row's OWN previous value for that field (`null` for a brand-new row, where
-- there is no previous value and every element is genuinely new) and only
-- validates elements NOT already present in it — an already-selected value
-- rides through unchanged no matter what the current option list says;
-- only a genuinely NEW selection has to be a currently-valid option.

drop function if exists internal.assert_valid_quality(text[]);
drop function if exists internal.assert_valid_symptoms(text[]);

create or replace function internal.assert_valid_quality(p_quality text[], p_activity_id uuid, p_previous text[] default null)
returns void
language plpgsql
stable
set search_path = internal, pg_temp
as $$
declare
  v text;
begin
  if p_quality is null then
    return;
  end if;
  foreach v in array p_quality loop
    if p_previous is not null and v = any (p_previous) then
      continue;
    end if;
    if not exists (select 1 from internal.effective_parameter_options(p_activity_id, 'quality') o where o.label = v) then
      raise exception 'invalid_quality' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function internal.assert_valid_symptoms(p_symptoms text[], p_activity_id uuid, p_previous text[] default null)
returns void
language plpgsql
stable
set search_path = internal, pg_temp
as $$
declare
  v text;
begin
  if p_symptoms is null then
    return;
  end if;
  foreach v in array p_symptoms loop
    if p_previous is not null and v = any (p_previous) then
      continue;
    end if;
    if not exists (select 1 from internal.effective_parameter_options(p_activity_id, 'symptom') o where o.label = v) then
      raise exception 'invalid_symptom' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function internal.assert_valid_flags(p_flags text[], p_activity_id uuid, p_previous text[] default null)
returns void
language plpgsql
stable
set search_path = internal, pg_temp
as $$
declare
  v text;
begin
  if p_flags is null then
    return;
  end if;
  foreach v in array p_flags loop
    if p_previous is not null and v = any (p_previous) then
      continue;
    end if;
    if not exists (select 1 from internal.effective_parameter_options(p_activity_id, 'flag') o where o.label = v) then
      raise exception 'invalid_flag' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function internal.assert_valid_quality(text[], uuid, text[]) from public, anon, authenticated;
revoke all on function internal.assert_valid_symptoms(text[], uuid, text[]) from public, anon, authenticated;
revoke all on function internal.assert_valid_flags(text[], uuid, text[]) from public, anon, authenticated;
grant execute on function internal.assert_valid_quality(text[], uuid, text[]) to authenticated, service_role;
grant execute on function internal.assert_valid_symptoms(text[], uuid, text[]) to authenticated, service_role;
grant execute on function internal.assert_valid_flags(text[], uuid, text[]) to authenticated, service_role;

-- ===========================================================================
-- Rewire create/reschedule (both already take p_activity_id) and the three
-- standalone setters (which don't — look the row's own activity_id + prior
-- value up first). Signatures are UNCHANGED (purely internal body edits),
-- so no `drop function`/client-side call-site change is needed anywhere.
-- ===========================================================================
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
  p_dreams text default null,
  p_field_selections jsonb default '[]'::jsonb
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

  perform internal.assert_valid_quality(p_quality, p_activity_id);
  perform internal.assert_valid_symptoms(p_symptoms, p_activity_id);
  perform internal.assert_valid_flags(p_flags, p_activity_id);
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

  perform internal.write_scheduled_activity_field_selections(v_row.id, p_field_selections);

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
  p_notes text default null,
  p_reflections jsonb default '[]'::jsonb,
  p_sleep_quality text[] default '{}',
  p_dreams text default null,
  p_field_selections jsonb default '[]'::jsonb
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
  v_previous_quality text[];
  v_previous_symptoms text[];
begin
  select internal.decrypt_quality(quality_encrypted), internal.decrypt_symptoms(symptoms_encrypted)
  into v_previous_quality, v_previous_symptoms
  from public.scheduled_activities
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  -- Rule 12: an already-selected value rides through unchanged even if it's
  -- no longer a valid option for the (possibly new) activity_id — only a
  -- genuinely new selection has to be currently valid. See this migration's
  -- top-of-file note.
  perform internal.assert_valid_quality(p_quality, p_activity_id, v_previous_quality);
  perform internal.assert_valid_symptoms(p_symptoms, p_activity_id, v_previous_symptoms);

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

  perform internal.assert_valid_sleep_quality(p_sleep_quality);

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

  perform internal.write_scheduled_activity_field_selections(v_row.id, p_field_selections);

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
  v_activity_id uuid;
  v_previous text[];
begin
  select activity_id, internal.decrypt_quality(quality_encrypted) into v_activity_id, v_previous
  from public.scheduled_activities
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform internal.assert_valid_quality(p_quality, v_activity_id, v_previous);

  update public.scheduled_activities set quality_encrypted = internal.encrypt_quality(p_quality)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

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
  v_activity_id uuid;
  v_previous text[];
begin
  select activity_id, internal.decrypt_symptoms(symptoms_encrypted) into v_activity_id, v_previous
  from public.scheduled_activities
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform internal.assert_valid_symptoms(p_symptoms, v_activity_id, v_previous);

  update public.scheduled_activities set symptoms_encrypted = internal.encrypt_symptoms(p_symptoms)
  where id = p_id and user_id = auth.uid() and deleted_at is null
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
  v_activity_id uuid;
  v_previous text[];
begin
  select activity_id, internal.decrypt_flags(flags_encrypted) into v_activity_id, v_previous
  from public.scheduled_activities
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform internal.assert_valid_flags(p_flags, v_activity_id, v_previous);

  update public.scheduled_activities set flags_encrypted = internal.encrypt_flags(p_flags)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- ===========================================================================
-- Sanity checks — mirrors this codebase's existing convention of a
-- throwaway-probe-user do-block (see `20260921060000_dynamic_note_fields.
-- sql`'s own seed-shape check), extended to also exercise the inheritance
-- rule and the rule-12 grandfather behavior end to end.
-- ===========================================================================
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_activity_id uuid;
  v_child_id uuid;
  v_count integer;
  v_raised boolean;
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.provision_default_tiles();
  perform public.provision_default_activities();
  perform public.provision_default_parameter_options();

  select count(*) into v_count from public.tiles where created_by = v_probe;
  if v_count <> 9 then
    raise exception 'provisioning check: expected 9 tiles, got %', v_count;
  end if;

  select count(*) into v_count from public.activities where created_by = v_probe;
  if v_count < 100 then
    raise exception 'provisioning check: expected the full catalog (100+ rows) copied, got %', v_count;
  end if;
  if exists (select 1 from public.activities where created_by = v_probe and parent_id is null and tile_id is null) then
    raise exception 'provisioning check: a top-level owned activity has no tile_id';
  end if;

  select count(*) into v_count from public.activity_parameter_options where created_by = v_probe and parameter_type = 'quality';
  if v_count <> 18 then
    raise exception 'provisioning check: expected 18 default quality options, got %', v_count;
  end if;

  -- Fallback: an activity with no override of its own sees the user's
  -- default list.
  select id into v_activity_id from public.activities where created_by = v_probe and parent_id is null limit 1;
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 18 then
    raise exception 'inheritance check: expected fallback 18 quality options for an unconfigured activity, got %', v_count;
  end if;

  -- Per-activity override: once this activity has its own quality rows,
  -- effective options are ONLY those, not the fallback list too.
  perform public.create_parameter_option('quality', 'Custom Feeling', v_activity_id);
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 1 then
    raise exception 'inheritance check: expected exactly 1 (overridden) quality option, got %', v_count;
  end if;

  -- A child of that activity with NO override of its own inherits the
  -- PARENT's override, not the user's fallback.
  select id into v_child_id from public.activities where created_by = v_probe and parent_id = v_activity_id limit 1;
  if v_child_id is not null then
    select count(*) into v_count from public.list_effective_parameter_options(v_child_id, 'quality');
    if v_count <> 1 then
      raise exception 'inheritance check: expected child to inherit parent''s 1 overridden quality option, got %', v_count;
    end if;
  end if;

  -- assert_valid_quality rejects a label outside the (now-overridden) list.
  v_raised := false;
  begin
    perform internal.assert_valid_quality(array['Resonance'], v_activity_id);
  exception when sqlstate '22023' then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'validation check: expected "Resonance" to be rejected once this activity overrides its quality list';
  end if;

  -- Rule 12: a value already present in `p_previous` rides through
  -- unchanged even though it is no longer valid for this activity.
  perform internal.assert_valid_quality(array['Resonance'], v_activity_id, array['Resonance']);

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.tiles where created_by = v_probe;
  delete from auth.users where id = v_probe;
end $$;
