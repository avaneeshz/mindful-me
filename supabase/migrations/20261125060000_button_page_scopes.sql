-- ===========================================================================
-- Button pages (sidebar: Dashboard, Product Page)
--
-- Each page holds the same buttons and categories a State Tile window does, so
-- it is stored the same way: `header_buttons.tile_card` / `header_button_groups.tile_card`.
-- Two numbers at the very top of the existing 1..500 range are reserved for them:
--   499 = Dashboard, 500 = Product Page.
-- Custom State Tiles are capped at 50 and numbered upward from 19, so they can
-- never reach these.
--
-- The only server rule in the way is `internal.owns_reflection_card`, which the
-- tile-scoped create RPCs use to validate `p_tile_card`. It gains the two
-- reserved numbers. Additive and expand-only: no column, constraint or RPC
-- signature changes; an older client never sends them.
-- ===========================================================================

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
    or exists (select 1 from public.reflection_custom_cards c where c.created_by = auth.uid() and c.card_number = p_card),
    false)
$$;

revoke all on function internal.owns_reflection_card(smallint) from public, anon;
grant execute on function internal.owns_reflection_card(smallint) to authenticated;
