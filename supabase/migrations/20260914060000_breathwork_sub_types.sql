-- Product request (user's own notes, spelling preserved verbatim): add a
-- `sub` list to the 'Breathwork' catalog card (`app/src/data/activities.ts`)
-- — Anulom Vilnulom / Sigh / Yawn / Slow / Deep / Hold / Pranayama /
-- Omkaram / Brahmari — mirroring the client-side change in the same
-- commit.
--
-- Child rows are required here, not optional: the established convention
-- (verified against the original seed data, not assumed) is that every
-- catalog card with a `sub` list gets matching child `public.activities`
-- rows under it, independent of `entry_mode`. 'Sports or Exercise' is the
-- clearest evidence — its sub list (Dance/Skipping/Running/HIIT/
-- Suryanamaskar/Moonnamaskar/Swimming/Badminton) was seeded as 8 child rows
-- in `20260829090000_fix_activities_category_and_reseed.sql` at a time when
-- it was still a plain tile-picker card, `entry_mode = 'quick_log'` was not
-- added until the later, separate `20260913060000_quick_log_exercise_
-- breathing.sql`. So the child rows track "does this card have a `sub`
-- list", not "is this card quick-log-eligible" — exactly the same
-- structural-parity reasoning `20260913060100_activities_sleep_quick_log.sql`
-- called out for Sleep ("scheduled_activities.path stores the chosen sub as
-- plain text, never a foreign key to this child row" — the child rows exist
-- for catalog-structure consistency, not because anything joins to them).
--
-- Breathwork itself already exists as a top-level row (seeded in the same
-- 20260829090000 reseed, category 'movement', icon 'Wind') with no children
-- — this migration only adds the 9 new child rows under its existing id,
-- purely additive, no update/delete of any existing row.
do $$
declare
  card_id uuid;
begin
  select id into card_id
  from public.activities
  where name = 'Breathwork' and parent_id is null;

  insert into public.activities (name, parent_id, icon_key) values ('Anulom Vilnulom', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Sigh', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Yawn', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Slow', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Deep', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Hold', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Pranayama', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Omkaram', card_id, 'Wind');
  insert into public.activities (name, parent_id, icon_key) values ('Brahmari', card_id, 'Wind');
end $$;
