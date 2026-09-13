-- New header quick-log button: Sleep. Its type vocabulary (Night sleep /
-- Nap / Power Nap) does NOT match any existing catalog card ('Night Sleep',
-- 'Day Sleep', 'Bed Exercise' are all flat, single-purpose tile-picker
-- cards with no sub-list) — see the full-stack-engineer agent definition's
-- Phase 2 scope and the product spec's own note on this. Rather than
-- overload one of those three, this adds a genuinely new top-level card,
-- 'Sleep', mirroring 'Sports or Exercise'/'Breathwork' above: a real
-- system-catalog row, `entry_mode = 'quick_log'`, with its 3 types stored as
-- child rows exactly like every other sub-having card (see
-- `activities_parent_id_fkey`), even though — like every sub list in this
-- table — `scheduled_activities.path` stores the chosen sub as plain text,
-- never a foreign key to this child row (`api/catalog.ts` only ever
-- resolves the TOP-LEVEL card id).
--
-- The button's own face value needs no new server-side logic: it is the
-- computed SUM(duration_minutes) of every 'Sleep' row logged today,
-- regardless of which of the 3 types each one is — the exact same
-- `quickLogName` sum-of-today mechanism Vipassana already uses (see
-- `components/DisplayValueButton.tsx`), for free, because all 3 types share
-- one top-level catalog identity.
do $$
declare
  card_id uuid;
begin
  insert into public.activities (name, category_id, icon_key, entry_mode)
  values ('Sleep', 'sleep', 'Bed', 'quick_log')
  returning id into card_id;

  insert into public.activities (name, parent_id, icon_key) values ('Night sleep', card_id, 'Bed');
  insert into public.activities (name, parent_id, icon_key) values ('Nap', card_id, 'Bed');
  insert into public.activities (name, parent_id, icon_key) values ('Power Nap', card_id, 'Bed');
end $$;
