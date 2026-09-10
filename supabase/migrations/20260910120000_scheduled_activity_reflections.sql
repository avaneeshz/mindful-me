-- Reflection cards, wired to a specific logged activity. Decided shape (see
-- the full-stack-engineer agent definition's Phase 3 scope): a reflection
-- card mapping is a property of one `scheduled_activities` row — the same
-- level as quality/symptoms, NOT a property of the activity type — and it is
-- many-to-many (one scheduled activity can carry several cards, one card can
-- be used on many scheduled activities), with EACH pairing carrying its own
-- note. That per-pairing note is exactly why this can't be a flat array
-- column the way `symptoms`/`quality` are (those share ONE note field per
-- row) — it needs a real join table.
--
-- Rule 10 — the per-pairing note is a "similarly sensitive field": its own
-- Vault secret, its own `internal`-schema SECURITY DEFINER encrypt/decrypt
-- pair, mirroring `encrypt_notes`/`decrypt_notes` exactly (freeform text,
-- `text` in / `bytea` out — unlike symptoms/quality's comma-joined array
-- shape, since each row here already IS one note, not a set of them).
--
-- RLS is scoped through the OWNING scheduled_activity's `user_id` (this
-- table has no `user_id` of its own) — the same "owner-scoped child table"
-- shape `activity_events` uses, generalized to an EXISTS join since that
-- table denormalizes its own `user_id` column and this one deliberately
-- does not (a reflection pairing has no independent identity worth
-- duplicating `user_id` for — `scheduled_activity_id` alone is enough to
-- resolve ownership, and denormalizing would just be one more place a
-- future edit could drift out of sync with the parent row).
--
-- API shape: reflections are bundled into `create_scheduled_activity` /
-- `reschedule_scheduled_activity` exactly like quality/symptoms/notes are —
-- the client's log-activity modal saves everything about one activity
-- together in one Save — PLUS a standalone `set_scheduled_activity_
-- reflections` for parity/future use, mirroring `set_scheduled_activity_
-- symptoms`. Every call REPLACES THE FULL SET for that activity (delete +
-- reinsert), the same "caller always sends the authoritative full value"
-- contract every other bundled field already has — never an incremental
-- add/remove RPC. `reflection_card_id` is filtered against the cards this
-- user can actually see (system defaults + their own) at insert time, so a
-- request naming an id outside that set is silently dropped rather than
-- trusted — the same boundary the SELECT RLS on `reflection_cards` already
-- draws, just enforced again here since a foreign key alone does not
-- respect RLS.
--
-- Every function that returns/depends on `scheduled_activity_dto` has to be
-- recreated in this one migration (same precedent as the two migrations
-- before this one): adding `reflections` means dropping and recreating the
-- composite type, which cascades through every dependent function.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activity_reflections_note_key',
  'Symmetric key for encrypting scheduled_activity_reflections.note_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activity_reflections_note_key'
);

create function internal.encrypt_reflection_note(note_text text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when note_text is null or note_text = '' then null
    else extensions.pgp_sym_encrypt(
      note_text,
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activity_reflections_note_key')
    )
  end
$$;

create function internal.decrypt_reflection_note(encrypted bytea)
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
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activity_reflections_note_key')
    )
  end
$$;

revoke all on function internal.encrypt_reflection_note(text) from public, anon, authenticated;
revoke all on function internal.decrypt_reflection_note(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_reflection_note(text) to authenticated, service_role;
grant execute on function internal.decrypt_reflection_note(bytea) to authenticated, service_role;

create table public.scheduled_activity_reflections (
  id uuid primary key default gen_random_uuid(),
  scheduled_activity_id uuid not null references public.scheduled_activities (id) on delete cascade,
  reflection_card_id uuid not null references public.reflection_cards (id),
  note_encrypted bytea,
  created_at timestamptz not null default now(),
  -- One pairing per (activity, card) — what makes "replace the full set"
  -- (delete + reinsert) well-defined and idempotent.
  unique (scheduled_activity_id, reflection_card_id)
);

create index scheduled_activity_reflections_activity_idx
  on public.scheduled_activity_reflections (scheduled_activity_id);
create index scheduled_activity_reflections_card_idx
  on public.scheduled_activity_reflections (reflection_card_id);

alter table public.scheduled_activity_reflections enable row level security;

create policy "read own scheduled activity reflections"
  on public.scheduled_activity_reflections for select
  to authenticated
  using (
    exists (
      select 1 from public.scheduled_activities s
      where s.id = scheduled_activity_reflections.scheduled_activity_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "insert own scheduled activity reflections"
  on public.scheduled_activity_reflections for insert
  to authenticated
  with check (
    exists (
      select 1 from public.scheduled_activities s
      where s.id = scheduled_activity_reflections.scheduled_activity_id
        and s.user_id = (select auth.uid())
    )
  );

-- No update policy: a changed note is a delete + reinsert (replace-the-
-- full-set), never an in-place UPDATE.
create policy "delete own scheduled activity reflections"
  on public.scheduled_activity_reflections for delete
  to authenticated
  using (
    exists (
      select 1 from public.scheduled_activities s
      where s.id = scheduled_activity_reflections.scheduled_activity_id
        and s.user_id = (select auth.uid())
    )
  );

-- --- Composite type: drop + recreate (cascades through every dependent
-- function's return type — all recreated below). ---------------------------
create type public.reflection_entry as (
  card_id uuid,
  note text
);

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
  quality text[],
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  symptoms text[],
  notes text,
  reflections public.reflection_entry[]
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

-- `p_reflections` appended at the end (after the existing trailing
-- `p_notes`), same convention as every previous field addition — every
-- existing NAMED-parameter call site keeps working unchanged for anything
-- that doesn't pass it. A JSON array of `{"card_id": "...", "note": "..."}`
-- objects — a `jsonb` parameter rather than a composite-array one, since
-- PostgREST's RPC calling convention needs a JSON-shaped argument from the
-- client, not a Postgres composite type literal.
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
  p_reflections jsonb default '[]'::jsonb
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

  -- Replace-the-full-set (delete + reinsert), same contract every other
  -- bundled field has — safe to run unconditionally on both the fresh-insert
  -- and the on-conflict-retry path. `reflection_card_id` is inner-joined
  -- against the cards this user can see, so an id outside that set is
  -- silently dropped rather than trusted (FK alone does not respect RLS).
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

revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb) to authenticated;
drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text);

-- Reflections ride along in reschedule too, exactly like quality/symptoms/
-- notes — the modal edits everything about one activity together in one
-- Save, so the client always sends the FULL current set on every reschedule.
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
  p_reflections jsonb default '[]'::jsonb
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

revoke execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb) from public, anon;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb) to authenticated;
drop function if exists public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text);

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

-- New — mirrors `set_scheduled_activity_symptoms` exactly, for a
-- reflections-only edit with no accompanying time change (parity/future
-- use, same as quality/symptoms/notes' own standalone setters; the client's
-- modal always bundles reflections into create/reschedule when saving the
-- whole entry). Replaces the full set, same as the bundled path above.
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
  -- A plain SELECT (not an UPDATE) to fetch + confirm ownership — this RPC
  -- changes no column on `scheduled_activities` itself, so it must not bump
  -- `updated_at` the way every real field-setter above legitimately does.
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
-- scheduled_activity` and `scheduling_ceiling` are untouched by this
-- migration (neither depends on the dto) so their existing grants are left
-- exactly as they are.
revoke all on function public.set_scheduled_activity_status(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_flags(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_quality(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_symptoms(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_notes(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_reflections(uuid, jsonb) from public, anon;
revoke all on function public.restore_scheduled_activity(uuid) from public, anon;
revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;

grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_quality(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_symptoms(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_notes(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_reflections(uuid, jsonb) to authenticated;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;
