-- User-chosen colours for tiles and activities (Classic edit mode's colour
-- picker). The user picks any colour for a tile or an activity; that colour
-- tints the tile and fills the activity's segment on the Day/Night strip.
--
-- This reverses `20260924060000_tiles.sql`'s "no colour field" judgment call
-- by explicit product-owner request: the monochrome retheme stays the
-- DEFAULT (a null colour renders exactly as before), colour is now a
-- per-user opt-in only.
--
-- Purely additive (expand only): two new nullable columns nothing depends on
-- yet, and two new RPCs. `list_tiles()`/`list_activities()` already return
-- `setof <table>` via `select *`, so they pick the new column up with no
-- change. No existing function signature changes.
--
-- Stored as a normalized `#rrggbb` hex string (lowercase). The CHECK is the
-- real authority (rule 4: the backend is the source of truth); the client
-- normalizes before sending so a valid pick is never rejected.

alter table public.tiles
  add column color text check (color is null or color ~ '^#[0-9a-f]{6}$');

alter table public.activities
  add column color text check (color is null or color ~ '^#[0-9a-f]{6}$');

-- `p_color` null clears the colour (back to the inherited/default look).
create or replace function public.set_tile_color(p_id uuid, p_color text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_color text := nullif(lower(btrim(coalesce(p_color, ''))), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_color is not null and v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid_color' using errcode = '22023';
  end if;

  update public.tiles set color = v_color
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'tile_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_tile_color(uuid, text) from public, anon;
grant execute on function public.set_tile_color(uuid, text) to authenticated;

create or replace function public.set_activity_color(p_id uuid, p_color text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_color text := nullif(lower(btrim(coalesce(p_color, ''))), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_color is not null and v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid_color' using errcode = '22023';
  end if;

  update public.activities set color = v_color
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'activity_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_activity_color(uuid, text) from public, anon;
grant execute on function public.set_activity_color(uuid, text) to authenticated;
