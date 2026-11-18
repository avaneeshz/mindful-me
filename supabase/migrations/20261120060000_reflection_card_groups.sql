-- State Tile CATEGORIES.
--
-- A user can create named categories and organise their State Tiles under
-- them (the same idea as the header buttons' categories). The whole layout is
-- one small per-account document: an ordered list of categories, each with
-- its name and the ordered list of tile numbers it holds.
--
--   [{ "id": uuid, "name": text, "cards": [smallint, ...] }, ...]
--
-- Every tile the account owns (built-in 1..18 plus its own custom ones) must
-- appear exactly once, hidden tiles included, so Restore puts a tile back in
-- the category it was in. The single write RPC validates all of that and also
-- keeps `reflection_card_order` equal to the layout flattened (category by
-- category), so everything that still reads the plain order keeps working and
-- a client that predates categories sees the same sequence.
--
-- Additive (expand-only): one new table and one new RPC. Nothing existing
-- changes. An account with no row simply has one category holding everything.
-- Reads are direct (own row, RLS); writes only go through the RPC.

create table public.reflection_card_groups (
  created_by uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  groups jsonb not null check (jsonb_typeof(groups) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.reflection_card_groups enable row level security;

create policy "read own reflection card groups"
  on public.reflection_card_groups for select
  to authenticated
  using (created_by = (select auth.uid()));

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

  select 18 + count(*) into v_expected from public.reflection_custom_cards where created_by = auth.uid();
  if cardinality(v_order) <> v_expected
     or (select count(distinct c) from unnest(v_order) as c where internal.owns_reflection_card(c)) <> v_expected then
    raise exception 'invalid_layout' using errcode = '22023';
  end if;

  insert into public.reflection_card_groups (created_by, groups)
  values (auth.uid(), p_groups)
  on conflict (created_by)
  do update set groups = excluded.groups, updated_at = now();

  insert into public.reflection_card_order (created_by, card_order)
  values (auth.uid(), v_order)
  on conflict (created_by)
  do update set card_order = excluded.card_order, updated_at = now();
end;
$$;

revoke all on function public.set_reflection_card_layout(jsonb) from public, anon;
grant execute on function public.set_reflection_card_layout(jsonb) to authenticated;
