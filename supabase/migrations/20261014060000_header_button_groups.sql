-- ===========================================================================
-- Header-button CATEGORIES (user-defined groups)
--
-- Until now the header had exactly four fixed rows, one per button kind
-- (notes / activity / daily number / checklist). This lets a user create any
-- number of named categories and put any mix of those four kinds of button
-- into each of them.
--
-- Additive (expand-only): a new table, a new nullable-then-backfilled column,
-- new RPCs, and `list_header_buttons()` gains one trailing column. The
-- previous client ignores the extra column and keeps working unchanged.
--
-- Every existing user starts with ONE category ("Buttons") holding all of
-- their buttons; they split it up themselves.
-- ===========================================================================

create table public.header_button_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index header_button_groups_user_idx on public.header_button_groups (user_id, sort_order);

create or replace function public.set_header_button_groups_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger header_button_groups_set_updated_at
  before update on public.header_button_groups
  for each row execute function public.set_header_button_groups_updated_at();

alter table public.header_button_groups enable row level security;

create policy header_button_groups_select_own on public.header_button_groups
  for select to authenticated using (user_id = auth.uid());
create policy header_button_groups_insert_own on public.header_button_groups
  for insert to authenticated with check (user_id = auth.uid());
create policy header_button_groups_update_own on public.header_button_groups
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy header_button_groups_delete_own on public.header_button_groups
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- header_buttons.group_id
-- ---------------------------------------------------------------------------
alter table public.header_buttons
  add column group_id uuid references public.header_button_groups (id) on delete restrict;

create index header_buttons_group_idx on public.header_buttons (group_id);

-- Backfill: one "Buttons" category per user who already has buttons.
with owners as (
  select distinct created_by as user_id from public.header_buttons where created_by is not null
), made as (
  insert into public.header_button_groups (user_id, name, sort_order)
  select user_id, 'Buttons', 0 from owners
  returning id, user_id
)
update public.header_buttons hb
   set group_id = made.id
  from made
 where hb.created_by = made.user_id;

-- ---------------------------------------------------------------------------
-- Integrity, enforced here (not only in React):
--   * a button's category must belong to the same user as the button;
--   * a button inserted without one (provisioning, create_header_button, any
--     older client) lands in the user's first category, which is created on
--     demand — so no creation path has to know about categories.
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
     order by g.sort_order, g.created_at
     limit 1;

    if new.group_id is null then
      insert into public.header_button_groups (user_id, name, sort_order)
      values (new.created_by, 'Buttons', 0)
      returning id into new.group_id;
    end if;
  elsif not exists (
    select 1 from public.header_button_groups g
     where g.id = new.group_id and g.user_id = new.created_by
  ) then
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger header_buttons_assign_group
  before insert or update of group_id on public.header_buttons
  for each row execute function public.header_buttons_assign_group();

-- ---------------------------------------------------------------------------
-- list_header_buttons() — same as before plus a trailing group_id.
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
  group_id uuid
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
    hb.group_id
  from public.header_buttons hb
  left join public.activities a on a.id = hb.activity_id
  left join public.header_button_user_state us on us.header_button_id = hb.id and us.user_id = auth.uid()
  where hb.created_by = auth.uid()
  order by coalesce(us.hidden, false), coalesce(us.sort_order, hb.sort_order), hb.created_at;
$$;

revoke all on function public.list_header_buttons() from public, anon;
grant execute on function public.list_header_buttons() to authenticated;

-- ---------------------------------------------------------------------------
-- Category RPCs
-- ---------------------------------------------------------------------------
create or replace function public.list_header_button_groups()
returns table (id uuid, name text, sort_order integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id, g.name, g.sort_order
    from public.header_button_groups g
   where g.user_id = auth.uid()
   order by g.sort_order, g.created_at;
$$;

-- `p_id` is client-supplied so a dropped-connection retry never duplicates.
create or replace function public.create_header_button_group(
  p_name text,
  p_id uuid default null
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
  if exists (select 1 from public.header_button_groups where id = v_id) then
    if exists (select 1 from public.header_button_groups where id = v_id and user_id = auth.uid()) then
      return v_id;
    end if;
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_next
    from public.header_button_groups where user_id = auth.uid();

  insert into public.header_button_groups (id, user_id, name, sort_order)
  values (v_id, auth.uid(), btrim(p_name), v_next);
  return v_id;
end;
$$;

create or replace function public.rename_header_button_group(
  p_id uuid,
  p_name text
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.header_button_groups
     set name = btrim(p_name)
   where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;
end;
$$;

-- Deleting a category never deletes buttons: they move to `p_move_to` (or, if
-- omitted, the user's first remaining category). The last category can't be
-- deleted, so a button always has somewhere to live.
create or replace function public.delete_header_button_group(
  p_id uuid,
  p_move_to uuid default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.header_button_groups where id = p_id and user_id = auth.uid()) then
    raise exception 'invalid_header_button_group' using errcode = '22023';
  end if;

  select g.id into v_target
    from public.header_button_groups g
   where g.user_id = auth.uid() and g.id <> p_id and (p_move_to is null or g.id = p_move_to)
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

create or replace function public.reorder_header_button_groups(
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
    update public.header_button_groups set sort_order = v_position
     where id = v_id and user_id = auth.uid();
    if not found then
      raise exception 'invalid_header_button_group' using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;
end;
$$;

-- One atomic write for a drag: which category each visible button now lives
-- in, and its order. `p_layout` is `[{ "groupId": uuid, "buttonIds": [uuid] }]`.
-- A drag between categories changes two lists at once; doing that as two calls
-- could be seen half-applied.
create or replace function public.arrange_header_buttons(
  p_layout jsonb
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entry jsonb;
  v_group uuid;
  v_button_text text;
  v_button uuid;
  v_position integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_layout is null or jsonb_typeof(p_layout) <> 'array' then
    raise exception 'invalid_header_button_layout' using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_layout) loop
    v_group := (v_entry ->> 'groupId')::uuid;
    if not exists (select 1 from public.header_button_groups where id = v_group and user_id = auth.uid()) then
      raise exception 'invalid_header_button_group' using errcode = '22023';
    end if;

    for v_button_text in select * from jsonb_array_elements_text(coalesce(v_entry -> 'buttonIds', '[]'::jsonb)) loop
      v_button := v_button_text::uuid;
      update public.header_buttons set group_id = v_group
       where id = v_button and created_by = auth.uid();
      if not found then
        raise exception 'invalid_header_button_id' using errcode = '22023';
      end if;

      insert into public.header_button_user_state (user_id, header_button_id, sort_order)
      values (auth.uid(), v_button, v_position)
      on conflict (user_id, header_button_id) do update set sort_order = excluded.sort_order;
      v_position := v_position + 1;
    end loop;
  end loop;
end;
$$;

revoke all on function public.list_header_button_groups() from public, anon;
revoke all on function public.create_header_button_group(text, uuid) from public, anon;
revoke all on function public.rename_header_button_group(uuid, text) from public, anon;
revoke all on function public.delete_header_button_group(uuid, uuid) from public, anon;
revoke all on function public.reorder_header_button_groups(uuid[]) from public, anon;
revoke all on function public.arrange_header_buttons(jsonb) from public, anon;
grant execute on function public.list_header_button_groups() to authenticated;
grant execute on function public.create_header_button_group(text, uuid) to authenticated;
grant execute on function public.rename_header_button_group(uuid, text) to authenticated;
grant execute on function public.delete_header_button_group(uuid, uuid) to authenticated;
grant execute on function public.reorder_header_button_groups(uuid[]) to authenticated;
grant execute on function public.arrange_header_buttons(jsonb) to authenticated;
