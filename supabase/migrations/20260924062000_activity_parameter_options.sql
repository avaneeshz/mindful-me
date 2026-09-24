-- PICKER-CUSTOM-1, part 3: `public.activity_parameter_options` — per-activity
-- (and per-sub-activity) customizable option lists for the three "how did it
-- go" vocabularies that were, until now, fixed global TS unions
-- (`ActivityQuality`, 18 values; `Symptom`, 6 values; `FlagId`, 14 values —
-- `domain/types.ts`) validated by a single hardcoded PL/pgSQL `IN (...)`
-- list apiece (`internal.assert_valid_quality`/`assert_valid_symptoms`, plus
-- a new `assert_valid_flags` this migration adds — flags had no server-side
-- validation at all before this). Confirmed product decision (see the
-- full-stack-engineer agent definition's brief): these are NOT staying one
-- global list — each activity or sub-activity can carry its own independent
-- option set per parameter type, distinct from every other activity's.
--
-- Judgment call — inheritance vs. flat per-activity-only (flagged per the
-- brief's own request to choose and explain): IMPLEMENTED inheritance. A
-- flat model would force re-configuring every leaf sub-activity separately
-- just to get options at all (a brand-new sub-activity would start with
-- ZERO options for all three parameters, not even the default set, since
-- defaults are only seeded at the fallback/`activity_id is null` level) —
-- that fails "new users still get a sensible generic default set" the
-- moment they add their first custom sub-activity. Inheritance means: an
-- activity's own rows for a parameter type if it has any; else its nearest
-- ancestor's own rows for that type; else the user's fallback
-- (`activity_id is null`) rows for that type. See
-- `internal.effective_parameter_options` below — implemented once, reused
-- both by the picker UI and by write-time validation, per the brief.
create table public.activity_parameter_options (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  -- Null = this user's fallback default for `parameter_type`, used by any
  -- activity that has no override of its own (and no ancestor with one).
  -- Non-null scopes it to exactly that activity/sub-activity node — same
  -- table either way, since a top-level activity and a drill-down option are
  -- both just rows in `public.activities`.
  activity_id uuid references public.activities (id) on delete cascade,
  parameter_type text not null check (parameter_type in ('quality', 'symptom', 'flag')),
  label text not null check (btrim(label) <> ''),
  icon_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Scoped uniqueness: a user can't define the same label twice for the same
-- (activity-or-fallback, type). `coalesce(..., nil-uuid)` mirrors
-- `header_buttons_key_scope_idx`'s own trick for treating every NULL
-- `activity_id` as one shared scope per user, rather than each comparing
-- unequal to every other (Postgres's normal NULL-uniqueness behavior).
create unique index activity_parameter_options_scope_idx
  on public.activity_parameter_options (
    created_by, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid), parameter_type, label
  );

create index activity_parameter_options_activity_idx on public.activity_parameter_options (activity_id);
create index activity_parameter_options_created_by_idx on public.activity_parameter_options (created_by);

create or replace function public.set_activity_parameter_options_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger activity_parameter_options_set_updated_at
  before update on public.activity_parameter_options
  for each row execute function public.set_activity_parameter_options_updated_at();

alter table public.activity_parameter_options enable row level security;

create policy "read own parameter options"
  on public.activity_parameter_options for select
  to authenticated
  using (created_by = (select auth.uid()));

create policy "insert own parameter options"
  on public.activity_parameter_options for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "update own parameter options"
  on public.activity_parameter_options for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- No delete policy — same reasoning as `tiles`/`activities`: real deletes
-- only ever happen through `delete_parameter_option` below, which is
-- SECURITY DEFINER and enforces the history-safety check itself. Unlike
-- tiles/activities, there is no FK to lean on here as a second line of
-- defense — a selected option's label is stored as plain decrypted-at-read
-- text on `scheduled_activities`, never an FK to this table (the same
-- "history keeps its own plain-text values, never an FK into a mutable
-- vocabulary" convention `flags`/`quality`/`symptoms` already follow) — so
-- the application-level check is the ONLY protection, which is exactly why
-- there must be no raw-DELETE path around it.

-- ===========================================================================
-- Inheritance lookup — the one place this rule lives, reused by both the
-- picker UI (`list_effective_parameter_options` below) and write-time
-- validation (`internal.assert_valid_*`, next migration).
-- ===========================================================================
create or replace function internal.effective_parameter_options(p_activity_id uuid, p_type text)
returns table (label text, icon_key text, sort_order integer)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  with recursive chain(id, depth) as (
    select p_activity_id, 0
    where p_activity_id is not null
    union all
    select a.parent_id, chain.depth + 1
    from public.activities a
    join chain on a.id = chain.id
    where a.parent_id is not null
  ),
  -- The nearest node (itself first, then walking up) that has ANY of its
  -- own rows for this parameter type.
  nearest_owned(activity_id) as (
    select chain.id
    from chain
    where exists (
      select 1 from public.activity_parameter_options apo
      where apo.activity_id = chain.id and apo.created_by = auth.uid() and apo.parameter_type = p_type
    )
    order by chain.depth
    limit 1
  )
  select apo.label, apo.icon_key, apo.sort_order
  from public.activity_parameter_options apo
  where apo.created_by = auth.uid()
    and apo.parameter_type = p_type
    -- No node in the chain owns any rows (including the "no activity at
    -- all" case, `p_activity_id is null`, where `chain`/`nearest_owned` are
    -- both empty) -> fall back to this user's `activity_id is null` rows.
    and apo.activity_id is not distinct from (select activity_id from nearest_owned)
  order by apo.sort_order;
$$;

revoke all on function internal.effective_parameter_options(uuid, text) from public, anon, authenticated;
grant execute on function internal.effective_parameter_options(uuid, text) to authenticated, service_role;

-- Public wrapper — what the picker UI actually calls.
create or replace function public.list_effective_parameter_options(p_activity_id uuid, p_type text)
returns table (label text, icon_key text, sort_order integer)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  select * from internal.effective_parameter_options(p_activity_id, p_type)
  where p_type in ('quality', 'symptom', 'flag');
$$;

revoke all on function public.list_effective_parameter_options(uuid, text) from public, anon;
grant execute on function public.list_effective_parameter_options(uuid, text) to authenticated;

-- Every option this activity (and, transitively through inheritance, its
-- descendants) actually OWNS at every level, for the "manage this
-- activity's options" editor — distinct from `list_effective_parameter_
-- options`, which only ever returns ONE level's worth (the resolved,
-- inherited-or-own list), never the raw per-node rows.
create or replace function public.list_parameter_options(p_activity_id uuid)
returns setof public.activity_parameter_options
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.activity_parameter_options
  where created_by = auth.uid() and activity_id is not distinct from p_activity_id
  order by parameter_type, sort_order;
$$;

revoke all on function public.list_parameter_options(uuid) from public, anon;
grant execute on function public.list_parameter_options(uuid) to authenticated;

-- ===========================================================================
-- Provisioning — seeds ONLY this user's fallback (`activity_id is null`)
-- rows, the current 18/6/14 default vocabularies verbatim. Deliberately does
-- NOT pre-seed per-activity rows for the ~70+ catalog nodes
-- `provision_default_activities()` just created — that would be needless row
-- bloat for something most users will never touch (per-activity rows only
-- start existing once a user actually customizes that specific activity's
-- list). Idempotent: a no-op if the caller already owns ANY parameter option
-- row (fallback or per-activity).
-- ===========================================================================
create or replace function public.provision_default_parameter_options()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.activity_parameter_options where created_by = v_user) then
    return;
  end if;

  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select v_user, null, 'quality', v.label, v.ord
  from (values
    ('Resonance', 0), ('Flow', 1), ('Scattered', 2), ('Overstimulated', 3), ('Zone out', 4),
    ('Numb', 5), ('Engaged', 6), ('Bored', 7), ('Resistant', 8), ('Frozen', 9), ('Avoiding', 10),
    ('Confusion', 11), ('Compulsive persistent', 12), ('Interoceptive Override', 13), ('Addictive', 14),
    ('Nourishing', 15), ('Draining', 16), ('Energizing', 17)
  ) as v(label, ord);

  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select v_user, null, 'symptom', v.label, v.ord
  from (values
    ('Pitta', 0), ('Inflammation', 1), ('Right knee pain', 2), ('Calves pain', 3), ('Temporal pain', 4), ('Dryness', 5)
  ) as v(label, ord);

  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select v_user, null, 'flag', v.label, v.ord
  from (values
    ('Trauma Activation', 0), ('Triggered', 1), ('Attack', 2), ('Anger', 3), ('Procrastinated', 4),
    ('Shut Down', 5), ('Collapse', 6), ('Over Accommodating', 7), ('Hyper Responsibility', 8),
    ('Over Function', 9), ('Intellectualization', 10), ('Optimization', 11), ('Hyper Vigilance', 12),
    ('Problem Solving', 13)
  ) as v(label, ord);
end;
$$;

revoke all on function public.provision_default_parameter_options() from public, anon;
grant execute on function public.provision_default_parameter_options() to authenticated;

-- ===========================================================================
-- CRUD RPCs
-- ===========================================================================
create or replace function public.create_parameter_option(
  p_parameter_type text,
  p_label text,
  p_activity_id uuid default null,
  p_icon_key text default null,
  p_id uuid default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_sort_order integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_parameter_type not in ('quality', 'symptom', 'flag') then
    raise exception 'invalid_parameter_type' using errcode = '22023';
  end if;
  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;
  if p_activity_id is not null and not exists (
    select 1 from public.activities where id = p_activity_id and created_by = auth.uid()
  ) then
    raise exception 'invalid_activity' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.activity_parameter_options
  where created_by = auth.uid() and activity_id is not distinct from p_activity_id and parameter_type = p_parameter_type;

  insert into public.activity_parameter_options (id, created_by, activity_id, parameter_type, label, icon_key, sort_order)
  values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_activity_id, p_parameter_type, btrim(p_label),
    nullif(btrim(coalesce(p_icon_key, '')), ''), v_sort_order
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    if p_id is not null then
      select id into v_id from public.activity_parameter_options where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_parameter_option_failed' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_parameter_option(text, text, uuid, text, uuid) from public, anon;
grant execute on function public.create_parameter_option(text, text, uuid, text, uuid) to authenticated;

create or replace function public.update_parameter_option(
  p_id uuid,
  p_label text,
  p_icon_key text default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  update public.activity_parameter_options
  set label = btrim(p_label), icon_key = nullif(btrim(coalesce(p_icon_key, '')), '')
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'parameter_option_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_parameter_option(uuid, text, text) from public, anon;
grant execute on function public.update_parameter_option(uuid, text, text) to authenticated;

create or replace function public.reorder_parameter_options(
  p_ordered_ids uuid[]
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_position integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  foreach v_id in array coalesce(p_ordered_ids, '{}') loop
    update public.activity_parameter_options set sort_order = v_position
    where id = v_id and created_by = auth.uid();
    if not found then
      raise exception 'invalid_parameter_option_id' using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_parameter_options(uuid[]) from public, anon;
grant execute on function public.reorder_parameter_options(uuid[]) to authenticated;

-- Whether this user has EVER stored this exact label under this parameter
-- type on any of their own `scheduled_activities` (planned, completed, or
-- soft-deleted-but-not-yet-purged — rule 11, same "still real history"
-- standard `activity_has_history` uses). The three arrays are each
-- encrypted at rest (rule 10); this has to decrypt to check membership,
-- which is only possible from a function that already has the Vault grant
-- (`internal.decrypt_quality`/`decrypt_symptoms`/`decrypt_flags` are all
-- already `security definer`) — SECURITY DEFINER here purely to reach those,
-- re-scoped to `auth.uid()` explicitly rather than relying on RLS.
create or replace function internal.parameter_option_in_use(p_type text, p_label text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, internal, pg_temp
as $$
begin
  if p_type = 'quality' then
    return exists (
      select 1 from public.scheduled_activities sa
      where sa.user_id = auth.uid() and p_label = any (internal.decrypt_quality(sa.quality_encrypted))
    );
  elsif p_type = 'symptom' then
    return exists (
      select 1 from public.scheduled_activities sa
      where sa.user_id = auth.uid() and p_label = any (internal.decrypt_symptoms(sa.symptoms_encrypted))
    );
  else
    return exists (
      select 1 from public.scheduled_activities sa
      where sa.user_id = auth.uid() and p_label = any (internal.decrypt_flags(sa.flags_encrypted))
    );
  end if;
end;
$$;

revoke all on function internal.parameter_option_in_use(text, text) from public, anon, authenticated;
grant execute on function internal.parameter_option_in_use(text, text) to authenticated, service_role;

create or replace function public.delete_parameter_option(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_owner uuid;
  v_type text;
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select created_by, parameter_type, label into v_owner, v_type, v_label
  from public.activity_parameter_options where id = p_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'parameter_option_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  if internal.parameter_option_in_use(v_type, v_label) then
    raise exception 'parameter_option_has_history' using errcode = 'P0001';
  end if;

  delete from public.activity_parameter_options where id = p_id and created_by = auth.uid();
end;
$$;

revoke all on function public.delete_parameter_option(uuid) from public, anon;
grant execute on function public.delete_parameter_option(uuid) to authenticated;

-- "Reset to inherited/default" — removes ALL of this activity's own rows
-- for one parameter type in one call, falling back to whatever its nearest
-- ancestor (or the user's own default) already provides. Same history-
-- safety rule applies per-row: any row still in use is left in place rather
-- than silently destroyed, and the caller is told which labels survived so
-- the UI can explain why the reset was only partial.
create or replace function public.reset_parameter_options_to_inherited(
  p_activity_id uuid,
  p_parameter_type text
) returns table (skipped_label text)
language plpgsql
set search_path = public, internal, pg_temp
as $$
declare
  v_row record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_activity_id is null then
    raise exception 'activity_required' using errcode = '22023';
  end if;

  for v_row in
    select id, label from public.activity_parameter_options
    where created_by = auth.uid() and activity_id = p_activity_id and parameter_type = p_parameter_type
  loop
    if internal.parameter_option_in_use(p_parameter_type, v_row.label) then
      skipped_label := v_row.label;
      return next;
    else
      delete from public.activity_parameter_options where id = v_row.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.reset_parameter_options_to_inherited(uuid, text) from public, anon;
grant execute on function public.reset_parameter_options_to_inherited(uuid, text) to authenticated;
