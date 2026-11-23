-- Four independent frames (Frame 1-4).
--
-- Each frame owns its own header buttons, activity tiles (tiles / activities / fields /
-- parameter options), state tiles (reflection cards) and everything logged through them
-- (notes, daily values, checklist completions). The TIMELINE (scheduled_activities and
-- its audit / reflections / field values) stays shared by all frames.
--
-- How: every frame-owned table gets `frame smallint` (1-4). It DEFAULTS to the frame the
-- request names in its `x-frame` header (internal.current_frame()), so the existing
-- insert paths need no change. Row-level security adds `frame_visible(frame)` to every
-- policy, so every read / update through SECURITY INVOKER functions is scoped to the
-- request's frame automatically. The SECURITY DEFINER functions that bypass RLS are
-- patched below by hand. Timeline functions run with `app.any_frame = 1` so a timeline
-- entry made in one frame can still be edited from another.
--
-- Frames 2-4 are then seeded as a full copy of every user's Frame 1 (setup AND history).
-- A frame can't be spoofed across users: every policy still pins created_by / user_id to
-- auth.uid(); `frame` only partitions a user's own rows.

create or replace function internal.current_frame()
returns smallint
language plpgsql
stable
set search_path = pg_temp
as $fn$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
  v_frame text;
begin
  if v_headers is not null then
    begin
      v_frame := v_headers::json ->> 'x-frame';
    exception when others then
      v_frame := null;
    end;
  end if;
  if v_frame ~ '^[1-4]$' then
    return v_frame::smallint;
  end if;
  return 1;
end;
$fn$;

-- True for the request's own frame, or for any frame inside a function that opted in
-- (the shared timeline) with `set app.any_frame = '1'`.
create or replace function internal.frame_visible(p_frame smallint)
returns boolean
language sql
stable
set search_path = internal, pg_temp
as $fn$
  select p_frame = internal.current_frame()
      or coalesce(current_setting('app.any_frame', true), '') = '1';
$fn$;

grant execute on function internal.current_frame() to authenticated, anon, service_role;
grant execute on function internal.frame_visible(smallint) to authenticated, anon, service_role;

-- 1. The frame column. Existing rows are Frame 1.
alter table public.tiles add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.tiles alter column frame set default internal.current_frame();
alter table public.activities add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.activities alter column frame set default internal.current_frame();
alter table public.activity_fields add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.activity_fields alter column frame set default internal.current_frame();
alter table public.parameter_options add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.parameter_options alter column frame set default internal.current_frame();
alter table public.header_buttons add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.header_buttons alter column frame set default internal.current_frame();
alter table public.header_button_groups add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.header_button_groups alter column frame set default internal.current_frame();
alter table public.note_entries add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.note_entries alter column frame set default internal.current_frame();
alter table public.daily_values add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.daily_values alter column frame set default internal.current_frame();
alter table public.supplement_completions add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.supplement_completions alter column frame set default internal.current_frame();
alter table public.reflection_card_overrides add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.reflection_card_overrides alter column frame set default internal.current_frame();
alter table public.reflection_card_notes add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.reflection_card_notes alter column frame set default internal.current_frame();
alter table public.reflection_card_order add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.reflection_card_order alter column frame set default internal.current_frame();
alter table public.reflection_custom_cards add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.reflection_custom_cards alter column frame set default internal.current_frame();
alter table public.reflection_card_hidden add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.reflection_card_hidden alter column frame set default internal.current_frame();
alter table public.reflection_card_groups add column if not exists frame smallint not null default 1 check (frame between 1 and 4);
alter table public.reflection_card_groups alter column frame set default internal.current_frame();

-- 2. Uniqueness is now per frame.
drop index if exists public.activities_top_level_name_per_user_idx;
create unique index activities_top_level_name_per_user_idx on public.activities (created_by, frame, name) where parent_id is null;

drop index if exists public.header_buttons_key_scope_idx;
create unique index header_buttons_key_scope_idx on public.header_buttons (created_by, frame, key) where key is not null;

drop index if exists public.parameter_options_scope_idx;
create unique index parameter_options_scope_idx on public.parameter_options (created_by, frame, parameter_type, label);

drop index if exists public.tiles_created_by_label_idx;
create unique index tiles_created_by_label_idx on public.tiles (created_by, frame, label);

alter table public.daily_values drop constraint if exists daily_values_user_id_metric_key_local_date_key;
drop index if exists public.daily_values_user_id_metric_key_local_date_key;
create unique index daily_values_user_frame_metric_date_key on public.daily_values (user_id, frame, metric_key, local_date);

alter table public.reflection_card_overrides drop constraint reflection_card_overrides_pkey;
alter table public.reflection_card_overrides add primary key (created_by, frame, card_number);
alter table public.reflection_custom_cards drop constraint reflection_custom_cards_pkey;
alter table public.reflection_custom_cards add primary key (created_by, frame, card_number);
alter table public.reflection_card_order drop constraint reflection_card_order_pkey;
alter table public.reflection_card_order add primary key (created_by, frame);
alter table public.reflection_card_hidden drop constraint reflection_card_hidden_pkey;
alter table public.reflection_card_hidden add primary key (created_by, frame);
alter table public.reflection_card_groups drop constraint reflection_card_groups_pkey;
alter table public.reflection_card_groups add primary key (created_by, frame);

create index if not exists note_entries_user_frame_button_idx on public.note_entries (user_id, frame, button_key, created_at desc);

-- 3. Row-level security: every existing policy also requires the row to be in the
--    request's frame. (The activities catalog read keeps the shared system rows visible.)
do $$
declare
  p record;
  v_tables text[] := array['tiles', 'activities', 'activity_fields', 'parameter_options', 'header_buttons', 'header_button_groups', 'note_entries', 'daily_values', 'supplement_completions', 'reflection_card_overrides', 'reflection_card_notes', 'reflection_card_order', 'reflection_custom_cards', 'reflection_card_hidden', 'reflection_card_groups'];
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = any (v_tables)
  loop
    if p.tablename = 'activities' and p.cmd = 'SELECT' then
      continue;
    end if;
    v_using := case when p.qual is null then null else '(' || p.qual || ') and internal.frame_visible(frame)' end;
    v_check := case when p.with_check is null then null else '(' || p.with_check || ') and internal.frame_visible(frame)' end;
    v_sql := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if v_using is not null then v_sql := v_sql || ' using (' || v_using || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end $$;

alter policy "read system catalog and own activities" on public.activities
  using (created_by is null or (created_by = (select auth.uid()) and internal.frame_visible(frame)));

-- 4. SECURITY DEFINER / trigger functions that bypass RLS, made frame-aware.
create or replace function internal.owns_reflection_card(p_card smallint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    p_card between 1 and 18
    or p_card in (499, 500)
    or exists (select 1 from public.reflection_custom_cards c where c.created_by = auth.uid() and c.frame = internal.current_frame() and c.card_number = p_card),
    false)
$$;

create or replace function public.set_reflection_card_hidden(p_card smallint, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_card is null or p_hidden is null or not internal.owns_reflection_card(p_card) then
    raise exception 'invalid_card' using errcode = '22023';
  end if;

  insert into public.reflection_card_hidden as r (created_by, hidden_cards)
  values (auth.uid(), case when p_hidden then array[p_card] else '{}'::smallint[] end)
  on conflict (created_by, frame) do update
    set hidden_cards = case
          when p_hidden then (select coalesce(array_agg(distinct c order by c), '{}') from unnest(array_append(r.hidden_cards, p_card)) as c)
          else array_remove(r.hidden_cards, p_card)
        end,
        updated_at = now();
end;
$$;

create or replace function public.set_reflection_card_image(
  p_card smallint,
  p_image_data text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_card is null or not internal.owns_reflection_card(p_card) then
    raise exception 'invalid_card' using errcode = '22023';
  end if;
  if p_image_data is not null and p_image_data not like 'data:image/jpeg;base64,%' then
    raise exception 'invalid_image_format' using errcode = '22023';
  end if;
  if p_image_data is not null and length(p_image_data) > 200000 then
    raise exception 'image_too_large' using errcode = '22023';
  end if;

  if p_image_data is null then
    update public.reflection_card_overrides
       set image_data = null, updated_at = now()
     where created_by = auth.uid() and frame = internal.current_frame() and card_number = p_card;
    delete from public.reflection_card_overrides
     where created_by = auth.uid() and frame = internal.current_frame() and card_number = p_card and name is null;
  else
    insert into public.reflection_card_overrides (created_by, card_number, image_data)
    values (auth.uid(), p_card, p_image_data)
    on conflict (created_by, frame, card_number)
    do update set image_data = excluded.image_data, updated_at = now();
  end if;
end;
$$;

create or replace function public.set_reflection_card_name(
  p_card smallint,
  p_name text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_card is null or not internal.owns_reflection_card(p_card) then
    raise exception 'invalid_card' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 30 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  -- A custom tile has no built-in title to fall back to, so it always keeps a name.
  if v_name is null and p_card > 18 then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if v_name is null then
    update public.reflection_card_overrides
       set name = null, updated_at = now()
     where created_by = auth.uid() and frame = internal.current_frame() and card_number = p_card;
    delete from public.reflection_card_overrides
     where created_by = auth.uid() and frame = internal.current_frame() and card_number = p_card and image_data is null;
  else
    insert into public.reflection_card_overrides (created_by, card_number, name)
    values (auth.uid(), p_card, v_name)
    on conflict (created_by, frame, card_number)
    do update set name = excluded.name, updated_at = now();
  end if;
end;
$$;

create or replace function public.set_reflection_card_order(p_order smallint[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select 18 + count(*) into v_expected from public.reflection_custom_cards where created_by = auth.uid() and frame = internal.current_frame();
  if p_order is null
     or cardinality(p_order) <> v_expected
     or (select count(distinct c) from unnest(p_order) as c where internal.owns_reflection_card(c)) <> v_expected then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  insert into public.reflection_card_order (created_by, card_order)
  values (auth.uid(), p_order)
  on conflict (created_by, frame)
  do update set card_order = excluded.card_order, updated_at = now();
end;
$$;

create or replace function public.set_reflection_card_layout(p_groups jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected int;
  v_group jsonb;
  v_name text;
  v_names text[] := '{}';
  v_ids uuid[] := '{}';
  v_id uuid;
  v_order smallint[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array'
     or jsonb_array_length(p_groups) < 1 or jsonb_array_length(p_groups) > 50 then
    raise exception 'invalid_layout' using errcode = '22023';
  end if;

  for v_group in select * from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(v_group) <> 'object' or jsonb_typeof(v_group -> 'cards') is distinct from 'array' then
      raise exception 'invalid_layout' using errcode = '22023';
    end if;
    v_name := btrim(coalesce(v_group ->> 'name', ''));
    if v_name = '' or char_length(v_name) > 40 or lower(v_name) = any (v_names) then
      raise exception 'invalid_group_name' using errcode = '22023';
    end if;
    v_names := array_append(v_names, lower(v_name));
    begin
      v_id := (v_group ->> 'id')::uuid;
    exception when others then
      raise exception 'invalid_layout' using errcode = '22023';
    end;
    if v_id = any (v_ids) then
      raise exception 'invalid_layout' using errcode = '22023';
    end if;
    v_ids := array_append(v_ids, v_id);
  end loop;

  -- Every owned tile exactly once, in category order.
  select coalesce(array_agg(c.card::smallint order by g.ord, c.ord), '{}')
    into v_order
    from jsonb_array_elements(p_groups) with ordinality as g(grp, ord),
         jsonb_array_elements_text(g.grp -> 'cards') with ordinality as c(card, ord);

  select 18 + count(*) into v_expected from public.reflection_custom_cards where created_by = auth.uid() and frame = internal.current_frame();
  if cardinality(v_order) <> v_expected
     or (select count(distinct c) from unnest(v_order) as c where internal.owns_reflection_card(c)) <> v_expected then
    raise exception 'invalid_layout' using errcode = '22023';
  end if;

  insert into public.reflection_card_groups (created_by, groups)
  values (auth.uid(), p_groups)
  on conflict (created_by, frame)
  do update set groups = excluded.groups, updated_at = now();

  insert into public.reflection_card_order (created_by, card_order)
  values (auth.uid(), v_order)
  on conflict (created_by, frame)
  do update set card_order = excluded.card_order, updated_at = now();
end;
$$;

create or replace function public.create_reflection_custom_card(
  p_name text,
  p_image_data text default null
) returns smallint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_next smallint;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if char_length(v_name) > 30 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if p_image_data is not null and p_image_data not like 'data:image/jpeg;base64,%' then
    raise exception 'invalid_image_format' using errcode = '22023';
  end if;
  if p_image_data is not null and length(p_image_data) > 200000 then
    raise exception 'image_too_large' using errcode = '22023';
  end if;

  -- Serialise this user's allocations so two tabs can't claim the same number.
  perform pg_advisory_xact_lock(hashtextextended('reflection_custom_card:' || auth.uid()::text || ':' || internal.current_frame()::text, 0));

  select count(*), coalesce(max(card_number), 18) + 1 into v_count, v_next
  from public.reflection_custom_cards where created_by = auth.uid() and frame = internal.current_frame();
  if v_count >= 50 then
    raise exception 'too_many_cards' using errcode = '22023';
  end if;

  insert into public.reflection_custom_cards (created_by, card_number) values (auth.uid(), v_next);
  insert into public.reflection_card_overrides (created_by, card_number, name, image_data)
  values (auth.uid(), v_next, v_name, p_image_data);

  -- A saved order gets the new tile at its end; with no saved order the built-in
  -- order plus custom tiles ascending is already what the app shows.
  update public.reflection_card_order set card_order = card_order || v_next, updated_at = now()
   where created_by = auth.uid() and frame = internal.current_frame();

  return v_next;
end;
$$;

create or replace function public.list_reflection_card_notes(p_card smallint)
returns setof public.reflection_card_note_dto
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.card_number, internal.decrypt_note_entry_text(n.note_encrypted), n.created_at, n.updated_at
  from public.reflection_card_notes n
  where n.created_by = auth.uid() and n.frame = internal.current_frame() and n.card_number = p_card
  order by n.created_at desc;
$$;

create or replace function public.header_buttons_assign_group()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.group_id is null then
    select g.id into new.group_id
      from public.header_button_groups g
     where g.user_id = new.created_by
       and g.frame = new.frame
       and g.tile_card is not distinct from new.tile_card
     order by g.sort_order, g.created_at
     limit 1;

    if new.group_id is null then
      insert into public.header_button_groups (user_id, name, sort_order, tile_card, frame)
      values (new.created_by, 'Buttons', 0, new.tile_card, new.frame)
      returning id into new.group_id;
    end if;
  elsif not exists (
    select 1 from public.header_button_groups g
     where g.id = new.group_id
       and g.user_id = new.created_by
       and g.frame = new.frame
       and g.tile_card is not distinct from new.tile_card
  ) then
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.delete_header_button(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_button public.header_buttons;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_button from public.header_buttons where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'header_button_not_found' using errcode = 'P0002';
  end if;

  if v_button.category = 'notes' and v_button.key is not null and exists (
    select 1 from public.note_entries where user_id = auth.uid() and frame = v_button.frame and button_key = v_button.key
  ) then
    raise exception 'header_button_has_history_use_hide' using errcode = 'P0001';
  end if;

  if v_button.category = 'day_value' and v_button.key is not null and exists (
    select 1 from public.daily_values where user_id = auth.uid() and frame = v_button.frame and metric_key = v_button.key
  ) then
    raise exception 'header_button_has_history_use_hide' using errcode = 'P0001';
  end if;

  if v_button.category = 'checklist' and exists (
    select 1 from public.supplement_completions where user_id = auth.uid() and header_button_id = p_id
  ) then
    raise exception 'header_button_has_history_use_hide' using errcode = 'P0001';
  end if;

  delete from public.header_buttons where id = p_id and created_by = auth.uid();
end;
$$;

create or replace function public.validate_note_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_button_id uuid;
  v_type_count integer;
begin
  if internal.is_state_tile_note_key(new.button_key) then
    if new.gift_type is not null or new.gift_types is not null then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    return new;
  end if;

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = new.button_key and created_by = new.user_id and frame = new.frame
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if new.gift_type is not null then
    if v_type_count = 0 then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = new.gift_type
    ) then
      raise exception 'invalid_gift_type' using errcode = '22023';
    end if;
  end if;

  if new.gift_types is not null then
    if v_type_count = 0 then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(new.gift_types) as t
      where not exists (
        select 1 from public.header_button_note_types nt where nt.header_button_id = v_button_id and nt.value = t
      )
    ) then
      raise exception 'invalid_gift_type' using errcode = '22023';
    end if;
    if new.gift_type is distinct from new.gift_types[1] then
      raise exception 'gift_type_mismatch' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_daily_value(
  p_metric_key text,
  p_local_date date,
  p_value integer
) returns public.daily_value_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.daily_values;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.header_buttons
    where category = 'day_value' and key = p_metric_key and created_by = auth.uid()
  ) then
    raise exception 'invalid_metric_key' using errcode = '22023';
  end if;

  if p_value is null or p_value < 0 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  insert into public.daily_values (user_id, metric_key, local_date, value)
  values (auth.uid(), p_metric_key, p_local_date, p_value)
  on conflict (user_id, frame, metric_key, local_date) do update set value = excluded.value
  where public.daily_values.user_id = auth.uid()
  returning * into v_row;

  return public.to_daily_value_dto(v_row);
end;
$$;

-- 5. The shared timeline keeps working across frames: its functions see every frame's
--    activities, options and fields (a timeline entry may belong to any frame).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in ('create_scheduled_activity', 'reschedule_scheduled_activity', 'list_scheduled_activities', 'to_scheduled_activity_dto', 'scheduling_ceiling', 'log_scheduled_activity_event', 'soft_delete_scheduled_activity', 'restore_scheduled_activity', 'purge_deleted_scheduled_activities', 'list_scheduled_activity_field_values', 'set_scheduled_activity_dreams', 'set_scheduled_activity_field_selections', 'set_scheduled_activity_field_values', 'set_scheduled_activity_flags', 'set_scheduled_activity_notes', 'set_scheduled_activity_quality', 'set_scheduled_activity_reflections', 'set_scheduled_activity_sleep_quality', 'set_scheduled_activity_status', 'set_scheduled_activity_symptoms'))
       or (n.nspname = 'internal' and p.proname in ('write_scheduled_activity_field_selections'))
  loop
    execute format('alter function %s set app.any_frame = ''1''', r.sig);
  end loop;
end $$;

-- 6. Seed Frames 2-4 as a copy of each user's Frame 1 (setup and history).
--    Only for users that have Frame 1 data and nothing yet in the target frame, so a
--    re-run never duplicates. Every id is remapped so the frames share no rows.
--    User triggers are paused during the copy (they would re-seed default fields /
--    re-validate what is being copied verbatim) and always restored.
do $copy$
begin
alter table public.tiles disable trigger user;
alter table public.activities disable trigger user;
alter table public.header_buttons disable trigger user;
alter table public.note_entries disable trigger user;
alter table public.daily_values disable trigger user;
alter table public.supplement_completions disable trigger user;

create temp table _frame_targets as
select u.user_id, f.frame
from (
  select created_by as user_id from public.tiles where frame = 1
  union select created_by from public.header_buttons where frame = 1 and created_by is not null
  union select user_id from public.header_button_groups where frame = 1
  union select created_by from public.reflection_card_overrides where frame = 1
  union select created_by from public.reflection_card_order where frame = 1
  union select created_by from public.reflection_card_hidden where frame = 1
  union select created_by from public.reflection_card_groups where frame = 1
  union select created_by from public.reflection_custom_cards where frame = 1
  union select created_by from public.reflection_card_notes where frame = 1
  union select user_id from public.note_entries where frame = 1 and deleted_at is null
  union select user_id from public.daily_values where frame = 1
) u
cross join (values (2::smallint), (3::smallint), (4::smallint)) as f(frame)
where not exists (select 1 from public.tiles t where t.created_by = u.user_id and t.frame = f.frame)
  and not exists (select 1 from public.header_buttons b where b.created_by = u.user_id and b.frame = f.frame);

create temp table _m_tiles as
select ft.frame, t.id as old_id, gen_random_uuid() as new_id
from public.tiles t join _frame_targets ft on ft.user_id = t.created_by where t.frame = 1;

create temp table _m_activities as
select ft.frame, a.id as old_id, gen_random_uuid() as new_id
from public.activities a join _frame_targets ft on ft.user_id = a.created_by where a.frame = 1;

create temp table _m_fields as
select ft.frame, f.id as old_id, gen_random_uuid() as new_id
from public.activity_fields f join _frame_targets ft on ft.user_id = f.created_by where f.frame = 1;

create temp table _m_options as
select ft.frame, p.id as old_id, gen_random_uuid() as new_id
from public.parameter_options p join _frame_targets ft on ft.user_id = p.created_by where p.frame = 1;

create temp table _m_groups as
select ft.frame, g.id as old_id, gen_random_uuid() as new_id
from public.header_button_groups g join _frame_targets ft on ft.user_id = g.user_id where g.frame = 1;

create temp table _m_buttons as
select ft.frame, b.id as old_id, gen_random_uuid() as new_id
from public.header_buttons b join _frame_targets ft on ft.user_id = b.created_by where b.frame = 1;

create temp table _m_note_fields as
select m.frame, nf.id as old_id, gen_random_uuid() as new_id
from public.header_button_note_fields nf join _m_buttons m on m.old_id = nf.header_button_id;

insert into public.tiles (id, created_by, label, icon_key, sort_order, hidden, created_at, updated_at, color, frame)
select m.new_id, t.created_by, t.label, t.icon_key, t.sort_order, t.hidden, t.created_at, t.updated_at, t.color, m.frame
from public.tiles t join _m_tiles m on m.old_id = t.id;

insert into public.activities (id, name, category_id, parent_id, icon_key, created_by, created_at, entry_mode, tile_id,
                               sort_order, hidden, disappear_mode, disappear_limit, color, note_label, second_note_label, frame)
select m.new_id, a.name, a.category_id, mp.new_id, a.icon_key, a.created_by, a.created_at, a.entry_mode, mt.new_id,
       a.sort_order, a.hidden, a.disappear_mode, a.disappear_limit, a.color, a.note_label, a.second_note_label, m.frame
from public.activities a
join _m_activities m on m.old_id = a.id
left join _m_activities mp on mp.old_id = a.parent_id and mp.frame = m.frame
left join _m_tiles mt on mt.old_id = a.tile_id and mt.frame = m.frame;

insert into public.activity_fields (id, activity_id, created_by, kind, label, sort_order, hidden, legacy_key, created_at, updated_at, frame)
select m.new_id, ma.new_id, f.created_by, f.kind, f.label, f.sort_order, f.hidden, f.legacy_key, f.created_at, f.updated_at, m.frame
from public.activity_fields f
join _m_fields m on m.old_id = f.id
join _m_activities ma on ma.old_id = f.activity_id and ma.frame = m.frame;

insert into public.activity_field_options (id, field_id, label, sort_order, hidden, created_at)
select gen_random_uuid(), mf.new_id, o.label, o.sort_order, o.hidden, o.created_at
from public.activity_field_options o
join _m_fields mf on mf.old_id = o.field_id;

insert into public.parameter_options (id, created_by, parameter_type, label, icon_key, sort_order, created_at, updated_at, frame)
select m.new_id, p.created_by, p.parameter_type, p.label, p.icon_key, p.sort_order, p.created_at, p.updated_at, m.frame
from public.parameter_options p join _m_options m on m.old_id = p.id;

insert into public.activity_parameter_selections (activity_id, option_id, created_by, created_at)
select ma.new_id, mo.new_id, s.created_by, s.created_at
from public.activity_parameter_selections s
join _m_activities ma on ma.old_id = s.activity_id
join _m_options mo on mo.old_id = s.option_id and mo.frame = ma.frame;

insert into public.header_button_groups (id, user_id, name, sort_order, created_at, updated_at, tile_card, frame)
select m.new_id, g.user_id, g.name, g.sort_order, g.created_at, g.updated_at, g.tile_card, m.frame
from public.header_button_groups g join _m_groups m on m.old_id = g.id;

insert into public.header_buttons (id, created_by, category, key, label, sort_order, activity_id, entry_mode, quick_log_type,
                                   quick_log_type_label, day_value_unit, day_value_target, created_at, updated_at, group_id, tile_card, frame)
select m.new_id, b.created_by, b.category, b.key, b.label, b.sort_order, coalesce(ma.new_id, b.activity_id), b.entry_mode,
       b.quick_log_type, b.quick_log_type_label, b.day_value_unit, b.day_value_target, b.created_at, b.updated_at,
       mg.new_id, b.tile_card, m.frame
from public.header_buttons b
join _m_buttons m on m.old_id = b.id
left join _m_activities ma on ma.old_id = b.activity_id and ma.frame = m.frame
left join _m_groups mg on mg.old_id = b.group_id and mg.frame = m.frame;

insert into public.header_button_user_state (user_id, header_button_id, hidden, sort_order, created_at, updated_at)
select s.user_id, m.new_id, s.hidden, s.sort_order, s.created_at, s.updated_at
from public.header_button_user_state s join _m_buttons m on m.old_id = s.header_button_id;

insert into public.header_button_note_fields (id, header_button_id, field_key, label, sort_order, field_kind)
select mf.new_id, mb.new_id, nf.field_key, nf.label, nf.sort_order, nf.field_kind
from public.header_button_note_fields nf
join _m_note_fields mf on mf.old_id = nf.id
join _m_buttons mb on mb.old_id = nf.header_button_id and mb.frame = mf.frame;

insert into public.header_button_field_options (id, note_field_id, label, sort_order)
select gen_random_uuid(), mf.new_id, o.label, o.sort_order
from public.header_button_field_options o join _m_note_fields mf on mf.old_id = o.note_field_id;

insert into public.header_button_note_types (id, header_button_id, value, sort_order)
select gen_random_uuid(), m.new_id, nt.value, nt.sort_order
from public.header_button_note_types nt join _m_buttons m on m.old_id = nt.header_button_id;

insert into public.header_button_checklist_items (id, header_button_id, item_key, label, sort_order)
select gen_random_uuid(), m.new_id, ci.item_key, ci.label, ci.sort_order
from public.header_button_checklist_items ci join _m_buttons m on m.old_id = ci.header_button_id;

insert into public.note_entries (id, user_id, button_key, note_encrypted, gift_type, created_at, updated_at, deleted_at, gift_types, frame)
select gen_random_uuid(), n.user_id, n.button_key, n.note_encrypted, n.gift_type, n.created_at, n.updated_at, null, n.gift_types, ft.frame
from public.note_entries n join _frame_targets ft on ft.user_id = n.user_id
where n.frame = 1 and n.deleted_at is null;

insert into public.daily_values (id, user_id, metric_key, local_date, value, created_at, updated_at, frame)
select gen_random_uuid(), d.user_id, d.metric_key, d.local_date, d.value, d.created_at, d.updated_at, ft.frame
from public.daily_values d join _frame_targets ft on ft.user_id = d.user_id
where d.frame = 1;

insert into public.supplement_completions (id, user_id, item_key, local_date, done, note_encrypted, completed_at, created_at, updated_at, header_button_id, frame)
select gen_random_uuid(), s.user_id, s.item_key, s.local_date, s.done, s.note_encrypted, s.completed_at, s.created_at, s.updated_at,
       m.new_id, m.frame
from public.supplement_completions s
join _m_buttons m on m.old_id = s.header_button_id;

insert into public.reflection_card_overrides (created_by, card_number, name, image_data, updated_at, frame)
select o.created_by, o.card_number, o.name, o.image_data, o.updated_at, ft.frame
from public.reflection_card_overrides o join _frame_targets ft on ft.user_id = o.created_by where o.frame = 1;

insert into public.reflection_custom_cards (created_by, card_number, created_at, frame)
select c.created_by, c.card_number, c.created_at, ft.frame
from public.reflection_custom_cards c join _frame_targets ft on ft.user_id = c.created_by where c.frame = 1;

insert into public.reflection_card_order (created_by, card_order, updated_at, frame)
select o.created_by, o.card_order, o.updated_at, ft.frame
from public.reflection_card_order o join _frame_targets ft on ft.user_id = o.created_by where o.frame = 1;

insert into public.reflection_card_hidden (created_by, hidden_cards, updated_at, frame)
select h.created_by, h.hidden_cards, h.updated_at, ft.frame
from public.reflection_card_hidden h join _frame_targets ft on ft.user_id = h.created_by where h.frame = 1;

insert into public.reflection_card_groups (created_by, groups, updated_at, frame)
select g.created_by, g.groups, g.updated_at, ft.frame
from public.reflection_card_groups g join _frame_targets ft on ft.user_id = g.created_by where g.frame = 1;

insert into public.reflection_card_notes (id, created_by, card_number, note_encrypted, created_at, updated_at, frame)
select gen_random_uuid(), n.created_by, n.card_number, n.note_encrypted, n.created_at, n.updated_at, ft.frame
from public.reflection_card_notes n join _frame_targets ft on ft.user_id = n.created_by where n.frame = 1;

alter table public.tiles enable trigger user;
alter table public.activities enable trigger user;
alter table public.header_buttons enable trigger user;
alter table public.note_entries enable trigger user;
alter table public.daily_values enable trigger user;
alter table public.supplement_completions enable trigger user;

drop table _frame_targets, _m_tiles, _m_activities, _m_fields, _m_options, _m_groups, _m_buttons, _m_note_fields;
end
$copy$;
