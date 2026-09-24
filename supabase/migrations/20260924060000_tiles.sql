-- Full user customization of the activity-picker hierarchy (PICKER-CUSTOM-1),
-- part 1: `public.tiles` — the top-level picker "tile" (formerly the fixed
-- 9-value `CategoryId` union baked into `domain/types.ts` + the static
-- `CATEGORIES`/`CATEGORY_ORDER` records in `data/activities.ts`, with zero
-- backing table at all). Any number of tiles now, per user: add, rename,
-- hide, reorder.
--
-- Ownership model: goes STRAIGHT to the final `header_buttons` shape
-- (`20260920080000_header_buttons_per_user_ownership.sql`) — unconditional
-- per-user ownership from day one, no `created_by is null` shared-default
-- phase. That migration's own history is the reason: header_buttons started
-- with a null-owner "shared system default" model and the product owner
-- explicitly rejected it afterwards ("no template/sample vs. live
-- distinction... every row a user has is unconditionally theirs"). This
-- table starts where that one ended up, per the full-stack-engineer agent
-- definition's explicit instruction not to repeat that revision.
--
-- Judgment call (flagged, not silently decided): the agent definition's own
-- proposed schema suggests a `color_token` column drawn from "a small
-- curated palette (derive it from the current 9 categories' `deep`/`light`
-- tokens plus a handful more)". Those per-category colour tokens no longer
-- exist — `data/activities.ts`'s own top-of-file note and
-- `domain/types.ts`'s `ScheduledActivity` doc comment both record that a
-- later, already-CONFIRMED product round replaced the entire per-category/
-- per-item colour system with "a single monochrome light/dark theme...
-- no per-category or per-item colour anywhere" (see this agent file's
-- Current Frontend Architecture, UI row). Adding `color_token` back here
-- would silently re-introduce exactly the per-tile colour system that
-- decision killed, and CLAUDE.md separately bans "random colors" for
-- anything not built on measured, restrained tokens. `tiles` therefore
-- carries no colour field at all — visual identity is `icon_key` only,
-- rendered through the same monochrome `ink`/`surface` chip treatment every
-- other icon already uses. Flagged in the PR/report rather than adding the
-- column quietly.
create table public.tiles (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  -- A Lucide icon component name (e.g. 'Moon', 'Utensils') — validated
  -- client-side against the actual icon set the app bundles (same
  -- convention `activities.icon_key` already uses, unvalidated at the DB
  -- layer for the same reason: the valid set is "whatever Lucide ships",
  -- which changes with the app's own dependency version, not a fixed
  -- vocabulary a CHECK constraint could usefully enumerate).
  icon_key text not null check (btrim(icon_key) <> ''),
  sort_order integer not null default 0,
  -- Hide, never a destructive default — mirrors `header_button_user_state.
  -- hidden`'s role, but as a plain owned column: there is no "shared vs.
  -- mine" split to overlay here (every row is already exactly one user's
  -- own), so a separate overlay table would be pure ceremony.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tiles_created_by_label_idx on public.tiles (created_by, label);
create index tiles_created_by_idx on public.tiles (created_by);

create or replace function public.set_tiles_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tiles_set_updated_at
  before update on public.tiles
  for each row execute function public.set_tiles_updated_at();

alter table public.tiles enable row level security;

create policy "read own tiles"
  on public.tiles for select
  to authenticated
  using (created_by = (select auth.uid()));

create policy "insert own tiles"
  on public.tiles for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "update own tiles"
  on public.tiles for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- No delete policy, deliberately (see `delete_tile` below): every hard
-- delete on this table goes through a SECURITY DEFINER RPC that re-checks
-- ownership itself and enforces the history-safety rule first — a raw
-- client-issued `DELETE` is never possible, so there is no path that skips
-- the history check.

-- ===========================================================================
-- Provisioning — the current 9 tiles, owned by the calling user. Idempotent:
-- a no-op if the caller already owns any tile (mirrors
-- `provision_default_header_buttons()` exactly).
-- ===========================================================================
create or replace function public.provision_default_tiles()
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

  if exists (select 1 from public.tiles where created_by = v_user) then
    return;
  end if;

  insert into public.tiles (created_by, label, icon_key, sort_order) values
    (v_user, 'Sleep & Rest', 'Moon', 0),
    (v_user, 'Food & Nourishment', 'Utensils', 1),
    (v_user, 'Personal Care', 'Droplet', 2),
    (v_user, 'Downtime & Errands', 'Tv', 3),
    (v_user, 'Movement & Body Therapy', 'Footprints', 4),
    (v_user, 'Work & Projects', 'Rocket', 5),
    (v_user, 'Nature & Spirit', 'Leaf', 6),
    (v_user, 'Growth & Connection', 'Sparkles', 7),
    (v_user, 'Home & Chores', 'Home', 8);
end;
$$;

revoke all on function public.provision_default_tiles() from public, anon;
grant execute on function public.provision_default_tiles() to authenticated;

-- ===========================================================================
-- RPCs
-- ===========================================================================
create or replace function public.list_tiles()
returns setof public.tiles
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.tiles
  where created_by = auth.uid()
  order by hidden, sort_order, created_at;
$$;

revoke all on function public.list_tiles() from public, anon;
grant execute on function public.list_tiles() to authenticated;

create or replace function public.create_tile(
  p_label text,
  p_icon_key text,
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

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;
  if btrim(coalesce(p_icon_key, '')) = '' then
    raise exception 'icon_required' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.tiles where created_by = auth.uid();

  insert into public.tiles (id, created_by, label, icon_key, sort_order)
  values (coalesce(p_id, gen_random_uuid()), auth.uid(), btrim(p_label), btrim(p_icon_key), v_sort_order)
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Idempotent-retry landed on an id that already exists (mirrors
    -- `create_header_button`'s own retry handling) — return it as-is.
    if p_id is not null then
      select id into v_id from public.tiles where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_tile_failed' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_tile(text, text, uuid) from public, anon;
grant execute on function public.create_tile(text, text, uuid) to authenticated;

create or replace function public.update_tile(
  p_id uuid,
  p_label text,
  p_icon_key text
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
  if btrim(coalesce(p_icon_key, '')) = '' then
    raise exception 'icon_required' using errcode = '22023';
  end if;

  update public.tiles set label = btrim(p_label), icon_key = btrim(p_icon_key)
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'tile_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_tile(uuid, text, text) from public, anon;
grant execute on function public.update_tile(uuid, text, text) to authenticated;

create or replace function public.set_tile_hidden(
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

  update public.tiles set hidden = coalesce(p_hidden, false)
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'tile_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_tile_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_tile_hidden(uuid, boolean) to authenticated;

-- One full reorder, same "recompute the whole array, send it once" contract
-- `reorder_header_buttons` already established.
create or replace function public.reorder_tiles(
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
    update public.tiles set sort_order = v_position
    where id = v_id and created_by = auth.uid();
    if not found then
      raise exception 'invalid_tile_id' using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_tiles(uuid[]) from public, anon;
grant execute on function public.reorder_tiles(uuid[]) to authenticated;

-- Hard delete — SECURITY DEFINER because there is no DELETE policy on this
-- table at all (see the top-of-file note): this function is the only path
-- that can ever remove a row, and it re-checks ownership itself before
-- doing so. Blocks (history-safety rule) if any activity under this tile —
-- at any depth — has ever had a `scheduled_activities` row (planned,
-- completed, or soft-deleted-but-not-yet-purged all count as real history;
-- only a hard purge past the 30-day window makes an activity truly free of
-- it). `public.activity_has_history` is defined in the next migration
-- (`20260924061000_activities_customization.sql`) — this function is
-- created there too, once `activities.tile_id` exists for it to walk.
create or replace function public.delete_tile(p_id uuid)
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

  select created_by into v_owner from public.tiles where id = p_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'tile_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.activities a
    where a.tile_id = p_id and public.activity_has_history(a.id)
  ) then
    raise exception 'tile_has_history_use_hide' using errcode = 'P0001';
  end if;

  delete from public.tiles where id = p_id and created_by = auth.uid();
end;
$$;

revoke all on function public.delete_tile(uuid) from public, anon;
grant execute on function public.delete_tile(uuid) to authenticated;
