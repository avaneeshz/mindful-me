-- PICKER-CUSTOM-1 follow-up: rewiring the LIVE picker (not just the new
-- management screen) onto `tiles`/`activities`/`activity_parameter_options`
-- surfaced a gap the original PICKER-CUSTOM-1 pass didn't cover — the
-- "locks/disappears for the rest of the day" rule (`ActivityCard.disappear`,
-- `domain/disappear.ts`) has ALWAYS lived purely in the client's static
-- `data/activities.ts` catalog, never in any database table. Once the
-- picker reads a user's OWN `activities` rows instead of that static file,
-- that per-item metadata (`auto:N` vs `manual`) has nowhere to come from —
-- provisioning a new user's catalog would otherwise silently lose it.
--
-- Fix: two new columns, additive (this table is live in production, but
-- these are brand-new columns nothing depends on yet — a pure expand, no
-- contract needed). Only TOP-LEVEL activities ever carry a disappear rule
-- (`domain/disappear.ts` only ever evaluates `ActivityCard`, which has
-- always meant a top-level card only — a drill-down sub-option was never
-- independently tracked) — enforced below exactly the same way
-- `header_buttons_day_value_target_requires_target` already enforces a
-- similar "only meaningful combined with something else" rule.
alter table public.activities
  add column disappear_mode text not null default 'manual' check (disappear_mode in ('manual', 'auto')),
  add column disappear_limit integer check (disappear_limit is null or disappear_limit > 0);

alter table public.activities add constraint disappear_auto_requires_limit check (
  disappear_mode <> 'auto' or disappear_limit is not null
);
alter table public.activities add constraint disappear_only_for_top_level check (
  parent_id is null or (disappear_mode = 'manual' and disappear_limit is null)
);

-- Re-seed `provision_default_activities()` to also carry each top-level
-- item's REAL disappear rule forward (read from `data/activities.ts` at the
-- time of writing — this is the one place that mapping has to be transcribed
-- by hand, since the shared catalog table itself never stored it before
-- now). Two names in the live shared catalog have no entry in
-- `data/activities.ts` at all (`Moon Exposure`/`Sun Exposure` — added by a
-- later, narrower migration for the Sun/Moon quick-log buttons, never given
-- a picker-tile disappear rule of their own) — both default to `manual`
-- (the column default, left unlisted below) rather than guessing a limit.
create or replace function public.provision_default_activities()
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

  if exists (select 1 from public.activities where created_by = v_user) then
    return;
  end if;

  perform public.provision_default_tiles();

  create temporary table _activity_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  loop
    insert into _activity_id_map (old_id, new_id)
    select a.id, gen_random_uuid()
    from public.activities a
    where a.created_by is null
      and not exists (select 1 from _activity_id_map m where m.old_id = a.id)
      and (a.parent_id is null or exists (select 1 from _activity_id_map m where m.old_id = a.parent_id));

    exit when not found;
  end loop;

  insert into public.activities (
    id, name, category_id, tile_id, parent_id, icon_key, entry_mode, created_by, sort_order,
    disappear_mode, disappear_limit
  )
  select
    m.new_id,
    a.name,
    a.category_id,
    case when a.parent_id is null then t.id else null end,
    pm.new_id,
    a.icon_key,
    a.entry_mode,
    v_user,
    (row_number() over (partition by coalesce(a.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) order by a.created_at) - 1),
    coalesce(d.disappear_mode, 'manual'),
    d.disappear_limit
  from public.activities a
  join _activity_id_map m on m.old_id = a.id
  left join _activity_id_map pm on pm.old_id = a.parent_id
  left join public.tiles t on a.parent_id is null and t.created_by = v_user and t.label = case a.category_id
    when 'sleep' then 'Sleep & Rest'
    when 'food' then 'Food & Nourishment'
    when 'care' then 'Personal Care'
    when 'downtime' then 'Downtime & Errands'
    when 'movement' then 'Movement & Body Therapy'
    when 'work' then 'Work & Projects'
    when 'nature' then 'Nature & Spirit'
    when 'growth' then 'Growth & Connection'
    when 'home' then 'Home & Chores'
    else null
  end
  left join (values
    ('Bath ritual', 'auto', 2), ('Body Care (self)', 'auto', 2), ('Hair Care', 'auto', 1), ('Oral Care', 'auto', 2),
    ('Dish washing', 'auto', 1), ('Eating', 'auto', 4), ('Gut', 'auto', 2), ('Liquids', 'auto', 3),
    ('Meal Prep', 'auto', 4), ('Soaking/Sprouting/Grinding', 'auto', 2),
    ('Coaching', 'auto', 1), ('Image Generation', 'auto', 1), ('Therapy', 'auto', 1),
    ('Clothes maintenance', 'auto', 1), ('Mopping/Brooming', 'auto', 1), ('Study table clean', 'auto', 1),
    ('Breathwork', 'auto', 2), ('Sports or Exercise', 'auto', 2), ('Vipassana', 'auto', 1),
    ('Daily Sunlight', 'auto', 1), ('Gardening', 'auto', 1), ('Nursery visit', 'auto', 1), ('Spiritual Care', 'auto', 5),
    ('Bed Exercise', 'auto', 2), ('Night Sleep', 'auto', 1), ('Author writing', 'auto', 1)
  ) as d(name, disappear_mode, disappear_limit) on d.name = a.name and a.parent_id is null
  where a.created_by is null;
end;
$$;

-- `create_activity`/`update_activity` — additive optional params (trailing,
-- defaulted), so no existing call site needs to change. Only meaningful for
-- a top-level (`p_tile_id`-rooted) activity; silently ignored for a
-- drill-down option, mirroring the CHECK constraint above rather than
-- raising for what the UI simply never offers a control for on a
-- sub-activity.
create or replace function public.create_activity(
  p_name text,
  p_tile_id uuid default null,
  p_parent_id uuid default null,
  p_icon_key text default null,
  p_id uuid default null,
  p_disappear_mode text default 'manual',
  p_disappear_limit integer default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_sort_order integer;
  v_mode text;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if (p_tile_id is null) = (p_parent_id is null) then
    raise exception 'exactly_one_of_tile_or_parent_required' using errcode = '22023';
  end if;

  if p_tile_id is not null and not exists (select 1 from public.tiles where id = p_tile_id and created_by = auth.uid()) then
    raise exception 'invalid_tile' using errcode = '22023';
  end if;
  if p_parent_id is not null and not exists (select 1 from public.activities where id = p_parent_id and created_by = auth.uid()) then
    raise exception 'invalid_parent' using errcode = '22023';
  end if;

  if p_parent_id is not null then
    v_mode := 'manual';
    v_limit := null;
  else
    if coalesce(p_disappear_mode, 'manual') not in ('manual', 'auto') then
      raise exception 'invalid_disappear_mode' using errcode = '22023';
    end if;
    if p_disappear_mode = 'auto' and (p_disappear_limit is null or p_disappear_limit < 1) then
      raise exception 'disappear_limit_required' using errcode = '22023';
    end if;
    v_mode := coalesce(p_disappear_mode, 'manual');
    v_limit := case when v_mode = 'auto' then p_disappear_limit else null end;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.activities
  where created_by = auth.uid()
    and tile_id is not distinct from p_tile_id
    and parent_id is not distinct from p_parent_id;

  insert into public.activities (
    id, name, tile_id, parent_id, icon_key, entry_mode, created_by, sort_order, disappear_mode, disappear_limit
  )
  values (
    coalesce(p_id, gen_random_uuid()), btrim(p_name), p_tile_id, p_parent_id,
    nullif(btrim(coalesce(p_icon_key, '')), ''), 'schedule', auth.uid(), v_sort_order, v_mode, v_limit
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    if p_id is not null then
      select id into v_id from public.activities where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_activity_failed' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

drop function if exists public.create_activity(text, uuid, uuid, text, uuid);

create or replace function public.update_activity(
  p_id uuid,
  p_name text,
  p_icon_key text default null,
  p_disappear_mode text default null,
  p_disappear_limit integer default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.activities;
  v_mode text;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;

  select * into v_row from public.activities where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'activity_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  if v_row.parent_id is not null or p_disappear_mode is null then
    -- A drill-down option never carries a disappear rule; omitting the
    -- param on a top-level activity leaves its existing rule untouched.
    v_mode := v_row.disappear_mode;
    v_limit := v_row.disappear_limit;
  else
    if p_disappear_mode not in ('manual', 'auto') then
      raise exception 'invalid_disappear_mode' using errcode = '22023';
    end if;
    if p_disappear_mode = 'auto' and (p_disappear_limit is null or p_disappear_limit < 1) then
      raise exception 'disappear_limit_required' using errcode = '22023';
    end if;
    v_mode := p_disappear_mode;
    v_limit := case when v_mode = 'auto' then p_disappear_limit else null end;
  end if;

  update public.activities
  set name = btrim(p_name),
      icon_key = nullif(btrim(coalesce(p_icon_key, '')), ''),
      disappear_mode = v_mode,
      disappear_limit = v_limit
  where id = p_id;
end;
$$;

drop function if exists public.update_activity(uuid, text, text);
