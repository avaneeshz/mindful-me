-- Catalog Customization, part 4: the Configuration screen's API layer.
--
-- Every function here is SECURITY INVOKER (the default — RLS is the real
-- enforcement boundary) EXCEPT the two `set_*_active` toggles below, which
-- are SECURITY DEFINER for a specific, narrow reason: soft-disabling a
-- SYSTEM row (a stock tile/card, `created_by is null`) can never satisfy
-- either table's "own row" update policy — no policy grants writes to a
-- system row to anyone, by design, since normally nothing should ever mutate
-- the shared system catalog directly. But this product has no multi-user
-- support at all (confirmed in PRODUCT-HANDOFF.md — one owner), and the
-- Configuration screen's whole premise is that its one user CAN hide any
-- tile/card, system-seeded or their own. A SECURITY DEFINER function scoped
-- to flipping exactly one boolean column (auth-required, nothing else) is
-- the same treatment this project already gives `encrypt_flags`/
-- `decrypt_flags` (`scheduling_api.sql`) and `internal.encrypt_note_entry_text`
-- (`note_entries.sql`) — a narrow, deliberate exception, not a general bypass.
create or replace function public.get_effective_catalog()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'label', c.label,
        'icon_key', c.icon_key,
        'sort_order', c.sort_order,
        'is_active', c.is_active
      ) order by c.sort_order)
      from public.catalog_categories c
      where c.is_active
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'category_id', a.category_id,
        'parent_id', a.parent_id,
        'icon_key', a.icon_key,
        'sort_order', a.sort_order,
        'is_active', a.is_active
      ) order by a.sort_order)
      from public.activities a
      where a.is_active
    ), '[]'::jsonb),
    'attribute_overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activity_id', o.activity_id,
        'attribute_type', o.attribute_type,
        'option_id', o.option_id
      ))
      from public.activity_attribute_options o
      where o.user_id = auth.uid()
    ), '[]'::jsonb)
  )
$$;

create or replace function public.create_catalog_category(
  p_label text,
  p_icon_key text
) returns public.catalog_categories
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.catalog_categories;
  v_sort_order int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_label is null or btrim(p_label) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order from public.catalog_categories;

  insert into public.catalog_categories (id, label, icon_key, sort_order, created_by)
  values (gen_random_uuid()::text, btrim(p_label), p_icon_key, v_sort_order, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

-- Handles all three levels (top-level card, sub, third) — reused verbatim,
-- exactly like `activities` itself already models all three the same way.
-- `p_parent_id null` + `p_category_id` set -> a top-level card;
-- `p_parent_id` set -> a sub/third (its `category_id` is always null,
-- inherited from its parent — same shape `top_level_has_category` requires).
create or replace function public.create_catalog_activity(
  p_name text,
  p_category_id text,
  p_parent_id uuid,
  p_icon_key text
) returns public.activities
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.activities;
  v_sort_order int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if p_parent_id is null and p_category_id is null then
    raise exception 'category_or_parent_required' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.activities
  where (p_parent_id is not null and parent_id = p_parent_id)
     or (p_parent_id is null and parent_id is null and category_id = p_category_id);

  insert into public.activities (name, category_id, parent_id, icon_key, sort_order, created_by, is_active)
  values (
    btrim(p_name),
    case when p_parent_id is null then p_category_id else null end,
    p_parent_id,
    p_icon_key,
    v_sort_order,
    auth.uid(),
    true
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- SECURITY DEFINER — see this migration's top comment for why. Applies to a
-- tile; `set_activity_active` below is the same treatment for a card/sub/
-- third. Both toggle exactly one boolean column, on exactly one row, behind
-- an auth check and nothing else.
create or replace function public.set_catalog_category_active(
  p_id text,
  p_is_active boolean
) returns public.catalog_categories
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.catalog_categories;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.catalog_categories set is_active = p_is_active
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

create or replace function public.set_activity_active(
  p_id uuid,
  p_is_active boolean
) returns public.activities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.activities;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.activities set is_active = p_is_active
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- Replaces the WHOLE allow-list for one (activity, attribute_type) pair —
-- delete-then-insert, never an in-place edit. SECURITY INVOKER: this only
-- ever touches the caller's OWN rows (`user_id = auth.uid()`), which the
-- table's existing insert/delete policies already allow outright — no
-- definer needed, unlike the two toggles above.
create or replace function public.set_activity_attribute_options(
  p_activity_id uuid,
  p_attribute_type text,
  p_option_ids text[]
) returns setof public.activity_attribute_options
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_attribute_type not in ('quality', 'symptom', 'flag') then
    raise exception 'invalid_attribute_type' using errcode = '22023';
  end if;

  delete from public.activity_attribute_options
  where activity_id = p_activity_id
    and attribute_type = p_attribute_type
    and user_id = auth.uid();

  -- Empty/omitted list = clear the override entirely — back to "show every
  -- master option" (the architecture's documented default for a fresh pair).
  if p_option_ids is not null and array_length(p_option_ids, 1) > 0 then
    insert into public.activity_attribute_options (activity_id, user_id, attribute_type, option_id)
    select p_activity_id, auth.uid(), p_attribute_type, option_id
    from unnest(p_option_ids) as option_id;
  end if;

  return query
    select * from public.activity_attribute_options
    where activity_id = p_activity_id and attribute_type = p_attribute_type and user_id = auth.uid();
end;
$$;

revoke all on function public.get_effective_catalog() from public, anon;
revoke all on function public.create_catalog_category(text, text) from public, anon;
revoke all on function public.create_catalog_activity(text, text, uuid, text) from public, anon;
revoke all on function public.set_catalog_category_active(text, boolean) from public, anon;
revoke all on function public.set_activity_active(uuid, boolean) from public, anon;
revoke all on function public.set_activity_attribute_options(uuid, text, text[]) from public, anon;

grant execute on function public.get_effective_catalog() to authenticated;
grant execute on function public.create_catalog_category(text, text) to authenticated;
grant execute on function public.create_catalog_activity(text, text, uuid, text) to authenticated;
grant execute on function public.set_catalog_category_active(text, boolean) to authenticated;
grant execute on function public.set_activity_active(uuid, boolean) to authenticated;
grant execute on function public.set_activity_attribute_options(uuid, text, text[]) to authenticated;
