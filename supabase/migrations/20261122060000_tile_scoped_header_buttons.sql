-- ===========================================================================
-- State Tile buttons: every State Tile gets the header's own button system
--
-- A State Tile's window now holds the same four kinds of button the header
-- does (quick activity, checklist, content entry, daily number), in the user's
-- own named categories, with the same order / hide / restore behaviour.
-- Nothing about the header changes: a button or category belongs to the header
-- when `tile_card` is null, and to that State Tile otherwise.
--
-- Until now a tile's button was marked only by a `tile<card>_…` storage key,
-- which exists for 'notes' buttons alone (activity and checklist buttons have
-- no key). A real column replaces that convention. Existing tile buttons (the
-- Decisions tile's) are backfilled from their key, so every button, and every
-- note stored under it, stays exactly where it is — nothing is moved,
-- re-keyed or deleted.
--
-- Additive (expand-only, WORKFLOW.md):
--   * two nullable columns; the header's rows keep `null`;
--   * `list_header_buttons()` gains one trailing column — an older client
--     ignores it;
--   * `list_header_button_groups()` keeps its shape and still answers with the
--     header's categories only, so an older client never shows a tile's;
--   * `create_header_button` / `create_header_button_group` gain one trailing
--     parameter with a default, so every existing call keeps working. The old
--     signatures are dropped only because two overloads would be ambiguous.
-- ===========================================================================

alter table public.header_buttons
  add column tile_card smallint check (tile_card is null or tile_card between 1 and 500);

alter table public.header_button_groups
  add column tile_card smallint check (tile_card is null or tile_card between 1 and 500);

create index header_buttons_tile_idx on public.header_buttons (created_by, tile_card) where tile_card is not null;
create index header_button_groups_tile_idx on public.header_button_groups (user_id, tile_card, sort_order);

-- ---------------------------------------------------------------------------
-- Integrity (here, not only in React): a button's category must belong to the
-- same user AND the same scope (the header, or the same tile) as the button.
-- A button inserted without a category lands in the first one of its own scope,
-- created on demand — so no creation path has to know about categories.
-- ---------------------------------------------------------------------------
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
       and g.tile_card is not distinct from new.tile_card
     order by g.sort_order, g.created_at
     limit 1;

    if new.group_id is null then
      insert into public.header_button_groups (user_id, name, sort_order, tile_card)
      values (new.created_by, 'Buttons', 0, new.tile_card)
      returning id into new.group_id;
    end if;
  elsif not exists (
    select 1 from public.header_button_groups g
     where g.id = new.group_id
       and g.user_id = new.created_by
       and g.tile_card is not distinct from new.tile_card
  ) then
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger header_buttons_assign_group on public.header_buttons;
create trigger header_buttons_assign_group
  before insert or update of group_id, tile_card on public.header_buttons
  for each row execute function public.header_buttons_assign_group();

-- ---------------------------------------------------------------------------
-- Backfill: the buttons already living on a tile (their key is `tile<n>_…`).
-- Clearing `group_id` in the same statement lets the trigger above file each
-- one under that tile's own "Buttons" category instead of the header's.
-- ---------------------------------------------------------------------------
update public.header_buttons
   set tile_card = substring(key from '^tile([0-9]{1,3})_')::smallint,
       group_id = null
 where tile_card is null
   and key ~ '^tile[0-9]{1,3}_[0-9a-z]+$'
   and substring(key from '^tile([0-9]{1,3})_')::integer between 1 and 500;

-- ---------------------------------------------------------------------------
-- list_header_buttons() — same as before plus a trailing tile_card.
-- ---------------------------------------------------------------------------
drop function if exists public.list_header_buttons();

create or replace function public.list_header_buttons()
returns table (
  id uuid,
  category text,
  key text,
  label text,
  sort_order numeric,
  hidden boolean,
  activity_id uuid,
  activity_name text,
  entry_mode text,
  quick_log_type boolean,
  quick_log_type_label text,
  day_value_unit text,
  day_value_target numeric,
  note_fields jsonb,
  note_types jsonb,
  checklist_items jsonb,
  group_id uuid,
  tile_card smallint
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    hb.id,
    hb.category,
    hb.key,
    hb.label,
    coalesce(us.sort_order, hb.sort_order)::numeric as sort_order,
    coalesce(us.hidden, false) as hidden,
    hb.activity_id,
    a.name as activity_name,
    hb.entry_mode,
    hb.quick_log_type,
    hb.quick_log_type_label,
    hb.day_value_unit,
    hb.day_value_target,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', nf.id,
        'fieldKind', nf.field_kind,
        'key', nf.field_key,
        'label', nf.label,
        'options', coalesce((
          select jsonb_agg(fo.label order by fo.sort_order)
          from public.header_button_field_options fo
          where fo.note_field_id = nf.id
        ), '[]'::jsonb)
      ) order by nf.sort_order)
      from public.header_button_note_fields nf where nf.header_button_id = hb.id
    ), '[]'::jsonb) as note_fields,
    coalesce((
      select jsonb_agg(nt.value order by nt.sort_order)
      from public.header_button_note_types nt where nt.header_button_id = hb.id
    ), '[]'::jsonb) as note_types,
    coalesce((
      select jsonb_agg(jsonb_build_object('key', ci.item_key, 'label', ci.label) order by ci.sort_order)
      from public.header_button_checklist_items ci where ci.header_button_id = hb.id
    ), '[]'::jsonb) as checklist_items,
    hb.group_id,
    hb.tile_card
  from public.header_buttons hb
  left join public.activities a on a.id = hb.activity_id
  left join public.header_button_user_state us on us.header_button_id = hb.id and us.user_id = auth.uid()
  where hb.created_by = auth.uid()
  order by coalesce(us.hidden, false), coalesce(us.sort_order, hb.sort_order), hb.created_at;
$$;

revoke all on function public.list_header_buttons() from public, anon;
grant execute on function public.list_header_buttons() to authenticated;

-- ---------------------------------------------------------------------------
-- Categories. The header's list is unchanged in shape and answers for the
-- header only; a tile's categories come from their own list.
-- ---------------------------------------------------------------------------
create or replace function public.list_header_button_groups()
returns table (id uuid, name text, sort_order integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id, g.name, g.sort_order
    from public.header_button_groups g
   where g.user_id = auth.uid() and g.tile_card is null
   order by g.sort_order, g.created_at;
$$;

create or replace function public.list_tile_header_button_groups()
returns table (id uuid, name text, sort_order integer, tile_card smallint)
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id, g.name, g.sort_order, g.tile_card
    from public.header_button_groups g
   where g.user_id = auth.uid() and g.tile_card is not null
   order by g.tile_card, g.sort_order, g.created_at;
$$;

-- `p_id` is client-supplied so a dropped-connection retry never duplicates.
drop function if exists public.create_header_button_group(text, uuid);

create or replace function public.create_header_button_group(
  p_name text,
  p_id uuid default null,
  p_tile_card smallint default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_next integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_tile_card is not null and not internal.owns_reflection_card(p_tile_card) then
    raise exception 'invalid_tile_card' using errcode = '22023';
  end if;
  if exists (select 1 from public.header_button_groups where id = v_id) then
    if exists (select 1 from public.header_button_groups where id = v_id and user_id = auth.uid()) then
      return v_id;
    end if;
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_next
    from public.header_button_groups
   where user_id = auth.uid() and tile_card is not distinct from p_tile_card;

  insert into public.header_button_groups (id, user_id, name, sort_order, tile_card)
  values (v_id, auth.uid(), btrim(p_name), v_next, p_tile_card);
  return v_id;
end;
$$;

-- Deleting a category never deletes buttons: they move to `p_move_to` (or, if
-- omitted, the first remaining category of the SAME scope). The last category
-- of a scope can't be deleted, so a button always has somewhere to live.
create or replace function public.delete_header_button_group(
  p_id uuid,
  p_move_to uuid default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target uuid;
  v_tile smallint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select g.tile_card into v_tile
    from public.header_button_groups g where g.id = p_id and g.user_id = auth.uid();
  if not found then
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;

  select g.id into v_target
    from public.header_button_groups g
   where g.user_id = auth.uid()
     and g.id <> p_id
     and g.tile_card is not distinct from v_tile
     and (p_move_to is null or g.id = p_move_to)
   order by g.sort_order, g.created_at
   limit 1;
  if v_target is null then
    raise exception 'cannot_delete_last_header_button_group' using errcode = '22023';
  end if;

  update public.header_buttons set group_id = v_target
   where group_id = p_id and created_by = auth.uid();
  delete from public.header_button_groups where id = p_id and user_id = auth.uid();
end;
$$;

revoke all on function public.list_header_button_groups() from public, anon;
revoke all on function public.list_tile_header_button_groups() from public, anon;
revoke all on function public.create_header_button_group(text, uuid, smallint) from public, anon;
revoke all on function public.delete_header_button_group(uuid, uuid) from public, anon;
grant execute on function public.list_header_button_groups() to authenticated;
grant execute on function public.list_tile_header_button_groups() to authenticated;
grant execute on function public.create_header_button_group(text, uuid, smallint) to authenticated;
grant execute on function public.delete_header_button_group(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_header_button — same as before plus a trailing p_tile_card. A button
-- made for a tile is filed under that tile's first category by the trigger.
-- ---------------------------------------------------------------------------
drop function if exists public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, text, numeric, jsonb, jsonb, jsonb
);

create or replace function public.create_header_button(
  p_category text,
  p_label text,
  p_id uuid default null,
  p_key text default null,
  p_activity_id uuid default null,
  p_entry_mode text default 'duration',
  p_quick_log_type boolean default false,
  p_quick_log_type_label text default null,
  p_day_value_unit text default null,
  p_day_value_target numeric default null,
  p_note_fields jsonb default '[]'::jsonb,
  p_note_types jsonb default '[]'::jsonb,
  p_checklist_items jsonb default '[]'::jsonb,
  p_tile_card smallint default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_sort_order integer;
  v_item jsonb;
  v_item_key text;
  v_seen text[] := '{}';
  v_inserted boolean := false;
  v_field jsonb;
  v_field_id uuid;
  v_field_kind text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_category not in ('activity', 'checklist', 'notes', 'day_value') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  if p_tile_card is not null and not internal.owns_reflection_card(p_tile_card) then
    raise exception 'invalid_tile_card' using errcode = '22023';
  end if;

  if p_category = 'activity' then
    if p_activity_id is null then
      raise exception 'activity_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.activities where id = p_activity_id and parent_id is null) then
      raise exception 'invalid_activity' using errcode = '22023';
    end if;
    if p_entry_mode not in ('duration', 'song_count') then
      raise exception 'invalid_entry_mode' using errcode = '22023';
    end if;
    v_key := null;
  elsif p_category = 'day_value' then
    if p_day_value_unit not in ('min', 'int', 'target') then
      raise exception 'invalid_day_value_unit' using errcode = '22023';
    end if;
    if p_day_value_unit = 'target' and p_day_value_target is null then
      raise exception 'target_required' using errcode = '22023';
    end if;
    if v_key is null then
      v_key := 'user_' || replace(gen_random_uuid()::text, '-', '');
    end if;
  elsif p_category = 'notes' then
    if v_key is null then
      v_key := 'user_' || replace(gen_random_uuid()::text, '-', '');
    end if;
  else
    v_key := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from public.header_buttons
  where created_by = auth.uid();

  insert into public.header_buttons (
    id, created_by, category, key, label, sort_order, activity_id, entry_mode,
    quick_log_type, quick_log_type_label, day_value_unit, day_value_target, tile_card
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_category, v_key, btrim(p_label), v_sort_order, p_activity_id,
    coalesce(p_entry_mode, 'duration'), coalesce(p_quick_log_type, false), p_quick_log_type_label,
    p_day_value_unit, p_day_value_target, p_tile_card
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    if p_id is not null then
      select id into v_id from public.header_buttons where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_header_button_failed' using errcode = 'P0001';
  end if;

  if p_category = 'activity' then
    for v_field in select * from jsonb_array_elements(coalesce(p_note_fields, '[]'::jsonb))
    loop
      v_field_kind := case when (v_field ->> 'fieldKind') = 'multiselect' then 'multiselect' else 'text' end;
      if btrim(coalesce(v_field ->> 'label', '')) = '' then
        continue;
      end if;
      if v_field_kind = 'text' and (v_field ->> 'key') not in ('primary', 'secondary') then
        continue;
      end if;

      insert into public.header_button_note_fields (header_button_id, field_key, field_kind, label, sort_order)
      values (
        v_id,
        case when v_field_kind = 'text' then (v_field ->> 'key') else null end,
        v_field_kind,
        btrim(v_field ->> 'label'),
        0
      )
      returning id into v_field_id;

      if v_field_kind = 'multiselect' then
        insert into public.header_button_field_options (note_field_id, label, sort_order)
        select v_field_id, btrim(opt), o - 1
        from jsonb_array_elements_text(coalesce(v_field -> 'options', '[]'::jsonb)) with ordinality as t (opt, o)
        where btrim(opt) <> '';
      end if;
    end loop;
  end if;

  if p_category = 'notes' then
    insert into public.header_button_note_types (header_button_id, value, sort_order)
    select v_id, btrim(elem), ord - 1
    from jsonb_array_elements_text(coalesce(p_note_types, '[]'::jsonb)) with ordinality as t (elem, ord)
    where btrim(elem) <> '';
  end if;

  if p_category = 'checklist' then
    for v_item in select * from jsonb_array_elements(coalesce(p_checklist_items, '[]'::jsonb))
    loop
      v_item_key := nullif(btrim(coalesce(v_item ->> 'key', '')), '');
      if v_item_key is null then
        v_item_key := lower(regexp_replace(btrim(coalesce(v_item ->> 'label', '')), '[^a-zA-Z0-9]+', '_', 'g'));
        v_item_key := trim(both '_' from v_item_key);
      end if;
      if v_item_key = '' or v_item_key is null then
        continue;
      end if;
      if v_item_key = any (v_seen) then
        v_item_key := v_item_key || '_' || substr(md5(random()::text), 1, 4);
      end if;
      v_seen := array_append(v_seen, v_item_key);
      insert into public.header_button_checklist_items (header_button_id, item_key, label, sort_order)
      values (v_id, v_item_key, btrim(v_item ->> 'label'), array_length(v_seen, 1) - 1);
      v_inserted := true;
    end loop;
    if not v_inserted then
      raise exception 'checklist_items_required' using errcode = '22023';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, text, numeric, jsonb, jsonb, jsonb, smallint
) from public, anon;
grant execute on function public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, text, numeric, jsonb, jsonb, jsonb, smallint
) to authenticated;
