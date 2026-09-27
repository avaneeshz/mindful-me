-- PICKER-CUSTOM-1, part 2: generalizes `public.activities` from a fixed
-- 9-value `category_id` enum + implicit (unstored) display order into a
-- user-owned tree rooted at `public.tiles`, with real reorder/hide/delete.
--
-- `activities` is ALREADY LIVE IN PRODUCTION (Migration Phases 1-3 are
-- done), so this file is an EXPAND ONLY step (WORKFLOW.md's expand-contract
-- rule) — every change here is additive (`tile_id`, `sort_order`, `hidden`,
-- all nullable-or-defaulted) and nothing existing is dropped or narrowed.
--
-- Judgment call (flagged): the full-stack-engineer agent definition's own
-- brief says to move `activities.created_by` to the SAME unconditional
-- per-user-ownership model as `tiles`/`header_buttons` IN THIS release.
-- That's the right end state, but doing it here the way
-- `20260920080000_header_buttons_per_user_ownership.sql` did it for
-- header_buttons (`delete from ... where created_by is null`, then
-- `alter column created_by set not null`) is NOT safe for this table the
-- way it was safe for that one: header_buttons had zero real usage when
-- that migration ran (verified: zero `auth.users` rows in this project at
-- the time). `activities` is different — it has been live since Phase 2,
-- `scheduled_activities.activity_id` already has real historical rows
-- referencing the shared (`created_by is null`) catalog (a prior migration,
-- `20260829090000_fix_activities_category_and_reseed.sql`, found exactly
-- this and had to special-case 3 referenced rows rather than deleting them),
-- and `scheduled_activities.activity_id` has NO `on delete cascade` — a
-- delete of a referenced shared row raises a hard FK error, not a quiet
-- cascade. Deleting every `created_by is null` row here, unconditionally,
-- risks aborting a real release the moment it hits production data rather
-- than a proven-empty test project. WORKFLOW.md's own rule is explicit:
-- "No destructive schema change ships in the same release as the code that
-- stops needing the old shape — expand this release, contract a later one."
-- That rule outranks this brief's shorthand, so: `created_by` STAYS
-- nullable this release, exactly like `category_id` is already scoped to be
-- dropped in a later contract pass (see the TODO below). What a new user
-- gets from day one is a full, genuinely-owned COPY of the shared catalog
-- (`provision_default_activities()` below) — rule 4 of the brief ("every
-- single row of it is theirs to edit or delete... never a shared row that
-- editing would affect another user") holds for every user from day one
-- regardless of whether the OLD shared rows are ever physically removed;
-- the client only ever shows/edits a user's own (`created_by = auth.uid()`)
-- rows once provisioned (see `state/useActivityCatalog.ts`), the same way
-- `useHeaderButtons.ts` already only shows a user's own header buttons.
--
-- TODO (contract, a later release, once nothing depends on the old shape):
-- drop `category_id`, delete the `created_by is null` shared rows (after
-- confirming, the way the 2026-08-29 migration did, that nothing in
-- production still references one), and set `created_by not null`.

alter table public.activities
  add column tile_id uuid references public.tiles (id) on delete cascade,
  add column sort_order integer not null default 0,
  add column hidden boolean not null default false;

create index activities_tile_id_idx on public.activities (tile_id);
create index activities_created_by_hidden_idx on public.activities (created_by, hidden) where created_by is not null;

comment on column public.activities.category_id is
  'DEPRECATED — superseded by tile_id (a real, user-owned public.tiles row) now that tile membership is user-customizable rather than a fixed 9-value enum. Kept for one more release per WORKFLOW.md''s expand-contract rule (this table is live in production); a follow-up migration drops it once no code path still reads it. See 20260924061000_activities_customization.sql.';

-- Every top-level, user-OWNED activity names a real tile; a drill-down
-- option inherits its tile implicitly by walking `parent_id`, exactly like
-- it already inherited `category_id`. Left un-enforced for `created_by is
-- null` rows (the legacy shared catalog never gets a `tile_id` — it has no
-- owner to provision a personal tile for) and for existing rows created
-- before this column existed, which is exactly what "not validated" already
-- meant for `category_id` pre-this-migration; a real CHECK constraint here
-- would immediately fail against every pre-existing legacy row.
alter table public.activities add constraint owned_top_level_has_tile check (
  created_by is null or parent_id is not null or tile_id is not null
);

-- ===========================================================================
-- History-safety: whether an activity (or ANY of its descendants, to
-- whatever depth) has ever had a real `scheduled_activities` row — planned,
-- completed, or soft-deleted-but-not-yet-purged all count (rule 11: a soft
-- delete is still real history for 30 days). Only a hard purge past that
-- window ever makes a node truly free of it. Used by `delete_tile` (previous
-- migration) and `delete_activity` (below) to decide hard-delete vs.
-- "hide instead."
-- ===========================================================================
create or replace function public.activity_has_history(p_activity_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive descendants(id) as (
    select p_activity_id
    union all
    select a.id from public.activities a join descendants d on a.parent_id = d.id
  )
  select exists (
    select 1 from public.scheduled_activities sa
    where sa.user_id = auth.uid() and sa.activity_id in (select id from descendants)
  );
$$;

revoke all on function public.activity_has_history(uuid) from public, anon;
grant execute on function public.activity_has_history(uuid) to authenticated;

-- ===========================================================================
-- Provisioning — a full, genuinely-owned COPY of the current shared catalog
-- (whatever it is AT THE TIME this runs — read live from the
-- `created_by is null` rows, never hand-duplicated as a static literal list,
-- so it can never drift from the actual seed the way a second hardcoded copy
-- eventually would). Idempotent: a no-op if the caller already owns any
-- activity. Always provisions this user's tiles first (idempotent itself),
-- so a top-level copy always has a real `tile_id` to attach to.
--
-- Mechanism: a topological copy over `parent_id`, one "generation" (breadth
-- level) per loop pass, via a temp old-id -> new-id map — handles the
-- catalog's REAL arbitrary depth (today: top-level -> sub -> third, e.g.
-- "Body Care (self)" -> "Oiling" -> "Face") without hardcoding a level
-- count, so it keeps working if the shared catalog ever grows a 4th level.
-- ===========================================================================
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

  -- Breadth-first topological copy: each pass maps every not-yet-mapped
  -- shared row whose parent is either root (null) or already mapped. Exits
  -- once a pass maps nothing further (the whole tree is covered).
  loop
    insert into _activity_id_map (old_id, new_id)
    select a.id, gen_random_uuid()
    from public.activities a
    where a.created_by is null
      and not exists (select 1 from _activity_id_map m where m.old_id = a.id)
      and (a.parent_id is null or exists (select 1 from _activity_id_map m where m.old_id = a.parent_id));

    exit when not found;
  end loop;

  -- `category_id` is copied through unchanged too (not just `tile_id`) —
  -- purely to satisfy the pre-existing `top_level_has_category` check
  -- constraint (`parent_id is not null or category_id is not null`), which
  -- this migration deliberately does NOT relax (see the deprecation comment
  -- above: `category_id` is a contract-later removal, not touched here).
  -- `tile_id` is the column every current and future code path actually
  -- reads for a provisioned row; `category_id` just rides along, unread.
  insert into public.activities (id, name, category_id, tile_id, parent_id, icon_key, entry_mode, created_by, sort_order)
  select
    m.new_id,
    a.name,
    a.category_id,
    case when a.parent_id is null then t.id else null end,
    pm.new_id,
    a.icon_key,
    a.entry_mode,
    v_user,
    (row_number() over (partition by coalesce(a.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) order by a.created_at) - 1)
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
  where a.created_by is null;
end;
$$;

revoke all on function public.provision_default_activities() from public, anon;
grant execute on function public.provision_default_activities() to authenticated;

-- ===========================================================================
-- RPCs — CRUD over a user's own activity tree.
-- ===========================================================================
create or replace function public.list_activities()
returns setof public.activities
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.activities
  where created_by = auth.uid()
  order by hidden, tile_id nulls last, sort_order, created_at;
$$;

revoke all on function public.list_activities() from public, anon;
grant execute on function public.list_activities() to authenticated;

-- `p_tile_id` for a new TOP-LEVEL item (`p_parent_id is null`); `p_parent_id`
-- for a drill-down option at any depth — arbitrary, no 3-level cap. Exactly
-- one of the two is required, mirroring `activities_activity_requires_
-- activity_id`-style either/or checks already used elsewhere in this schema.
create or replace function public.create_activity(
  p_name text,
  p_tile_id uuid default null,
  p_parent_id uuid default null,
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

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.activities
  where created_by = auth.uid()
    and tile_id is not distinct from p_tile_id
    and parent_id is not distinct from p_parent_id;

  insert into public.activities (id, name, tile_id, parent_id, icon_key, entry_mode, created_by, sort_order)
  values (
    coalesce(p_id, gen_random_uuid()), btrim(p_name), p_tile_id, p_parent_id,
    nullif(btrim(coalesce(p_icon_key, '')), ''), 'schedule', auth.uid(), v_sort_order
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

revoke all on function public.create_activity(text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.create_activity(text, uuid, uuid, text, uuid) to authenticated;

-- Rename/re-icon only — moving an activity to a different tile/parent isn't
-- a product ask in this pass (not mentioned anywhere in the brief); reorder
-- within the current sibling group is `reorder_activities` below.
create or replace function public.update_activity(
  p_id uuid,
  p_name text,
  p_icon_key text default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;

  update public.activities
  set name = btrim(p_name), icon_key = nullif(btrim(coalesce(p_icon_key, '')), '')
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'activity_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_activity(uuid, text, text) from public, anon;
grant execute on function public.update_activity(uuid, text, text) to authenticated;

create or replace function public.set_activity_hidden(
  p_id uuid,
  p_hidden boolean
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.activities set hidden = coalesce(p_hidden, false)
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'activity_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_activity_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_activity_hidden(uuid, boolean) to authenticated;

-- One sibling group at a time (every id in `p_ordered_ids` must already
-- share the same tile/parent) — same "recompute the whole array, send it
-- once" contract as `reorder_tiles`/`reorder_header_buttons`.
create or replace function public.reorder_activities(
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
    update public.activities set sort_order = v_position
    where id = v_id and created_by = auth.uid();
    if not found then
      raise exception 'invalid_activity_id' using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_activities(uuid[]) from public, anon;
grant execute on function public.reorder_activities(uuid[]) to authenticated;

-- Hard delete — SECURITY DEFINER for the same reason `delete_tile` is: no
-- DELETE policy exists on this table, so this is the only path that can
-- remove a row, and it re-checks ownership + history-safety itself.
-- Deleting a node with no history cascades to its own descendants via the
-- existing `activities_parent_id_fkey ... on delete cascade` — safe, since
-- `activity_has_history` already covers the whole subtree, not just this
-- one node.
create or replace function public.delete_activity(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select created_by into v_owner from public.activities where id = p_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'activity_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  if public.activity_has_history(p_id) then
    raise exception 'activity_has_history_use_hide' using errcode = 'P0001';
  end if;

  delete from public.activities where id = p_id and created_by = auth.uid();
end;
$$;

revoke all on function public.delete_activity(uuid) from public, anon;
grant execute on function public.delete_activity(uuid) to authenticated;
