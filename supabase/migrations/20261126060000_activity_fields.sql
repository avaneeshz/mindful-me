-- Per-activity custom fields: any number of titled text notes and any number
-- of multiple-select fields (each with its own options) on a TOP-LEVEL
-- activity. Subtypes use their parent's fields (no rows of their own).
--
-- Replaces, over several releases (expand-contract — WORKFLOW.md), the fixed
-- shape a logged activity has today: two note columns (`notes_encrypted`,
-- `dreams_encrypted`) and the three shared-vocabulary option lists
-- (quality / symptom / flag). This migration is the EXPAND step only:
--   * three new tables (fields, options, logged values) — purely additive;
--   * every existing top-level user activity is seeded with the same fields
--     it effectively has today: its note(s) and the three multiple-select
--     fields "Activity quality", "Chronic symptoms" and "Protective
--     response", carrying over the options currently effective for it;
--   * every existing logged value is copied into the new values table.
-- Nothing existing is altered or dropped: the legacy columns, the shared
-- `parameter_options` vocabulary and every existing RPC keep working, so the
-- app that is live today is unaffected until a later release reads the new
-- tables. The legacy columns are dropped in their own later migration.
--
-- Deleting a field or option that history used is a HIDE (`hidden = true`),
-- never a hard delete: past entries keep showing it and it can be restored.
-- A logged value stores the chosen option LABELS (not ids) so renaming or
-- hiding an option never orphans history — same convention as
-- `scheduled_activity_field_selections`.
--
-- Rule 10 — logged values are as sensitive as the columns they replace, so
-- they use the same encrypted-bytea + Vault + `internal` SECURITY DEFINER
-- pair: text notes via `encrypt_notes`/`decrypt_notes`, selected labels via
-- `encrypt_field_selections`/`decrypt_field_selections` (chr(31) delimited,
-- safe for labels containing commas).

-- ===========================================================================
-- 1. Fields and options (owner-only, like every other per-user config table).
-- ===========================================================================
create table public.activity_fields (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('text', 'multiselect')),
  label text not null check (btrim(label) <> '' and char_length(label) <= 60),
  sort_order integer not null default 0,
  hidden boolean not null default false,
  -- Marks the five fields that existed before this feature, so the migration
  -- (and the later contract step) can tell them from user-made ones. Null for
  -- every field a user adds.
  legacy_key text check (legacy_key in ('note_primary', 'note_secondary', 'quality', 'symptom', 'flag')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, legacy_key)
);
create index activity_fields_activity_idx on public.activity_fields (activity_id);

create table public.activity_field_options (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.activity_fields (id) on delete cascade,
  label text not null check (btrim(label) <> '' and char_length(label) <= 60),
  sort_order integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (field_id, label)
);
create index activity_field_options_field_idx on public.activity_field_options (field_id);

-- Fields live on top-level activities only (subtypes inherit), a text field
-- never has options, and an option may only belong to a multiselect field.
create function internal.assert_field_shape()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'activity_fields' then
    if exists (select 1 from public.activities a where a.id = new.activity_id and a.parent_id is not null) then
      raise exception 'activity_field_on_subtype' using errcode = '23514';
    end if;
    if not exists (select 1 from public.activities a where a.id = new.activity_id and a.created_by = new.created_by) then
      raise exception 'activity_field_not_owner' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.kind <> old.kind or new.activity_id <> old.activity_id) then
      raise exception 'activity_field_kind_immutable' using errcode = '23514';
    end if;
    new.updated_at = now();
  else
    if not exists (select 1 from public.activity_fields f where f.id = new.field_id and f.kind = 'multiselect') then
      raise exception 'option_on_non_multiselect_field' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger activity_fields_shape
  before insert or update on public.activity_fields
  for each row execute function internal.assert_field_shape();
create trigger activity_field_options_shape
  before insert or update on public.activity_field_options
  for each row execute function internal.assert_field_shape();

alter table public.activity_fields enable row level security;
alter table public.activity_field_options enable row level security;

create policy "read own activity fields"
  on public.activity_fields for select to authenticated
  using (created_by = (select auth.uid()));
create policy "write own activity fields"
  on public.activity_fields for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "read own activity field options"
  on public.activity_field_options for select to authenticated
  using (exists (select 1 from public.activity_fields f where f.id = field_id and f.created_by = (select auth.uid())));
create policy "write own activity field options"
  on public.activity_field_options for all to authenticated
  using (exists (select 1 from public.activity_fields f where f.id = field_id and f.created_by = (select auth.uid())))
  with check (exists (select 1 from public.activity_fields f where f.id = field_id and f.created_by = (select auth.uid())));

-- ===========================================================================
-- 2. Logged values — encrypted, one row per (logged activity, field).
-- ===========================================================================
create table public.scheduled_activity_field_values (
  id uuid primary key default gen_random_uuid(),
  scheduled_activity_id uuid not null references public.scheduled_activities (id) on delete cascade,
  -- No cascade: a field with history is hidden, never deleted (see header).
  field_id uuid not null references public.activity_fields (id),
  text_encrypted bytea,
  labels_encrypted bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheduled_activity_id, field_id)
);
create index scheduled_activity_field_values_sa_idx on public.scheduled_activity_field_values (scheduled_activity_id);
create index scheduled_activity_field_values_field_idx on public.scheduled_activity_field_values (field_id);

create function internal.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger scheduled_activity_field_values_touch
  before update on public.scheduled_activity_field_values
  for each row execute function internal.touch_updated_at();

alter table public.scheduled_activity_field_values enable row level security;
create policy "read own field values"
  on public.scheduled_activity_field_values for select to authenticated
  using (exists (select 1 from public.scheduled_activities sa where sa.id = scheduled_activity_id and sa.user_id = (select auth.uid())));
create policy "write own field values"
  on public.scheduled_activity_field_values for all to authenticated
  using (exists (select 1 from public.scheduled_activities sa where sa.id = scheduled_activity_id and sa.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.scheduled_activities sa where sa.id = scheduled_activity_id and sa.user_id = (select auth.uid()))
    and exists (select 1 from public.activity_fields f where f.id = field_id and f.created_by = (select auth.uid()))
  );

-- ===========================================================================
-- 3. Seeding: the five "standard" fields every top-level activity starts with.
-- ===========================================================================
-- The options effective for (user, activity, type) — the same inheritance
-- rule as `internal.effective_parameter_option_ids`, but taking the owner
-- explicitly instead of `auth.uid()`, so it works in a migration and a trigger.
create function internal.parameter_option_labels_for(p_user uuid, p_activity_id uuid, p_type text)
returns table (label text, sort_order integer)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  with recursive chain(id, depth) as (
    select p_activity_id, 0
    union all
    select a.parent_id, chain.depth + 1
    from public.activities a join chain on a.id = chain.id
    where a.parent_id is not null
  ),
  nearest_owned(activity_id) as (
    select chain.id from chain
    where exists (
      select 1 from public.activity_parameter_selections aps
      join public.parameter_options po on po.id = aps.option_id
      where aps.activity_id = chain.id and aps.created_by = p_user and po.parameter_type = p_type
    )
    order by chain.depth limit 1
  )
  select po.label, po.sort_order
  from public.parameter_options po
  where po.created_by = p_user and po.parameter_type = p_type
    and (
      po.id in (
        select aps.option_id from public.activity_parameter_selections aps
        where aps.created_by = p_user and aps.activity_id = (select activity_id from nearest_owned)
      )
      or not exists (select 1 from nearest_owned)
    )
  order by po.sort_order;
$$;

-- Adds the standard fields to one top-level user activity. Idempotent: a field
-- that already exists (matched by legacy_key) is left untouched.
create function internal.seed_activity_fields(p_activity_id uuid)
returns void
language plpgsql
set search_path = public, internal, pg_temp
as $$
declare
  a public.activities%rowtype;
  v_field uuid;
  v_type text;
begin
  select * into a from public.activities where id = p_activity_id;
  if not found or a.parent_id is not null or a.created_by is null then
    return;
  end if;

  insert into public.activity_fields (activity_id, created_by, kind, label, sort_order, legacy_key)
  values (a.id, a.created_by, 'text', coalesce(nullif(btrim(a.note_label), ''), 'Notes'), 0, 'note_primary')
  on conflict (activity_id, legacy_key) do nothing;

  if nullif(btrim(a.second_note_label), '') is not null then
    insert into public.activity_fields (activity_id, created_by, kind, label, sort_order, legacy_key)
    values (a.id, a.created_by, 'text', btrim(a.second_note_label), 1, 'note_secondary')
    on conflict (activity_id, legacy_key) do nothing;
  end if;

  for v_type in select unnest(array['quality', 'symptom', 'flag']) loop
    insert into public.activity_fields (activity_id, created_by, kind, label, sort_order, legacy_key)
    values (
      a.id, a.created_by, 'multiselect',
      case v_type when 'quality' then 'Activity quality' when 'symptom' then 'Chronic symptoms' else 'Protective response' end,
      case v_type when 'quality' then 2 when 'symptom' then 3 else 4 end,
      v_type
    )
    on conflict (activity_id, legacy_key) do nothing
    returning id into v_field;

    if v_field is not null then
      insert into public.activity_field_options (field_id, label, sort_order)
      select v_field, o.label, (row_number() over (order by o.sort_order, o.label))::int - 1
      from internal.parameter_option_labels_for(a.created_by, a.id, v_type) o
      on conflict (field_id, label) do nothing;
    end if;
    v_field := null;
  end loop;
end;
$$;

-- Every future top-level activity gets them too, so the invariant "a top-level
-- activity always has its standard fields" holds without client cooperation.
create function internal.seed_activity_fields_trigger()
returns trigger
language plpgsql
set search_path = public, internal, pg_temp
as $$
begin
  if new.parent_id is null and new.created_by is not null then
    perform internal.seed_activity_fields(new.id);
  end if;
  return new;
end;
$$;
create trigger activities_seed_fields
  after insert on public.activities
  for each row execute function internal.seed_activity_fields_trigger();

-- ===========================================================================
-- 4. Backfill existing data.
-- ===========================================================================
do $$
declare
  r record;
begin
  for r in select id from public.activities where parent_id is null and created_by is not null loop
    perform internal.seed_activity_fields(r.id);
  end loop;

  -- A note that already holds text under an activity whose second-note title
  -- was never set still needs a home: give it a hidden field so history is
  -- not lost (the user can unhide and rename it).
  insert into public.activity_fields (activity_id, created_by, kind, label, sort_order, hidden, legacy_key)
  select distinct root.id, root.created_by, 'text', 'Notes 2', 1, true, 'note_secondary'
  from public.scheduled_activities sa
  join public.activities act on act.id = sa.activity_id
  join lateral (
    with recursive up(id, parent_id, created_by) as (
      select act.id, act.parent_id, act.created_by
      union all
      select p.id, p.parent_id, p.created_by from public.activities p join up on p.id = up.parent_id
    )
    select id, created_by from up where parent_id is null
  ) root on true
  where sa.dreams_encrypted is not null and root.created_by is not null
  on conflict (activity_id, legacy_key) do nothing;

  -- Copy every logged value across.
  insert into public.scheduled_activity_field_values (scheduled_activity_id, field_id, text_encrypted, labels_encrypted)
  select s.id, f.id,
    case when f.kind = 'text' then s.text_enc end,
    case when f.kind = 'multiselect' then s.labels_enc end
  from (
    select sa.id, k.legacy_key,
      case k.legacy_key
        when 'note_primary' then sa.notes_encrypted
        -- `dreams_encrypted` uses its own Vault key; re-encrypt under the notes key.
        when 'note_secondary' then internal.encrypt_notes(internal.decrypt_dreams(sa.dreams_encrypted))
      end as text_enc,
      case k.legacy_key
        when 'quality' then internal.encrypt_field_selections(internal.decrypt_quality(sa.quality_encrypted))
        when 'symptom' then internal.encrypt_field_selections(internal.decrypt_symptoms(sa.symptoms_encrypted))
        when 'flag' then internal.encrypt_field_selections(internal.decrypt_flags(sa.flags_encrypted))
      end as labels_enc,
      (
        with recursive up(id, parent_id) as (
          select a.id, a.parent_id from public.activities a where a.id = sa.activity_id
          union all
          select p.id, p.parent_id from public.activities p join up on p.id = up.parent_id
        )
        select id from up where parent_id is null
      ) as root_id
    from public.scheduled_activities sa
    cross join (values ('note_primary'), ('note_secondary'), ('quality'), ('symptom'), ('flag')) as k(legacy_key)
    where sa.activity_id is not null
  ) s
  join public.activity_fields f on f.activity_id = s.root_id and f.legacy_key = s.legacy_key
  where s.text_enc is not null or s.labels_enc is not null
  on conflict (scheduled_activity_id, field_id) do nothing;
end;
$$;

revoke all on function internal.seed_activity_fields(uuid) from public, anon, authenticated;
revoke all on function internal.parameter_option_labels_for(uuid, uuid, text) from public, anon, authenticated;
