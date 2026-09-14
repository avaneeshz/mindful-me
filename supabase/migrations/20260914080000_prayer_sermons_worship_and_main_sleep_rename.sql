-- Two independent, unrelated changes bundled into one migration because they
-- land in the same client round (see the full-stack-engineer agent
-- definition's report for this round):
--
-- 1) Prayer, Sermons and Worship become real header quick-log buttons —
--    structurally identical to Vipassana/Exercise/Breathing/Sleep — instead
--    of the pure freeform-note pills they used to be (`domain/notes.ts`'s
--    `NOTE_BUTTONS`, keys `prayer`/`summons`/`worship`). A note alone never
--    blocked real time on the Timeline the way every other quick-log button
--    does, so this promotes all three to genuinely new top-level
--    `public.activities` rows, `entry_mode = 'quick_log'`, mirroring
--    `20260913060100_activities_sleep_quick_log.sql`'s own reasoning for why
--    Sleep needed a new card rather than reusing an existing one: none of
--    Prayer/Sermons/Worship existed as catalog cards before (only as
--    note-pill keys, structurally unrelated to this table). Their
--    `category_id`/`icon_key` match the client-side cards added to
--    `data/activities.ts` in the same round. Prayer keeps its old note
--    button's 7-value type vocabulary as child rows, exactly like Sleep's 3
--    sleep-types above — `scheduled_activities.path` still stores the chosen
--    type as plain text, never a foreign key to these child rows
--    (`api/catalog.ts` only ever resolves the TOP-LEVEL card id). Sermons and
--    Worship get no child rows — neither has a type vocabulary (Worship's
--    quick-log popover uses a "Start + number of songs" entry mode instead of
--    a type selector). The `prayer`/`summons`/`worship` NOTE_BUTTON keys and
--    every note already stored under them in `public.note_entries` are left
--    completely untouched by this migration — this is a new, separate entry
--    point, not a data migration of the old notes.
--
-- 2) The Sleep quick-log button's "Night sleep" sub-type is renamed to "Main
--    sleep" (client-side rename in the same round). This UPDATE is scoped by
--    `parent_id` (the existing 'Sleep' top-level row) *and* the old name, so
--    it can only ever touch that one child row — it cannot reach the
--    unrelated, differently-capitalized 'Night Sleep' TOP-LEVEL tile-card row
--    (`parent_id is null`), which is a distinct legacy card and stays exactly
--    as-is. Any `scheduled_activities.path` already logged as `['Night
--    sleep']` keeps that literal historical value forever, same as every
--    other taxonomy rename this table has already been through (e.g.
--    "Writing — author journey").
do $$
declare
  prayer_id uuid;
begin
  insert into public.activities (name, category_id, icon_key, entry_mode)
  values ('Prayer', 'nature', 'Hand', 'quick_log')
  returning id into prayer_id;

  insert into public.activities (name, parent_id, icon_key) values ('Adoration', prayer_id, 'Hand');
  insert into public.activities (name, parent_id, icon_key) values ('Thanksgiving', prayer_id, 'Hand');
  insert into public.activities (name, parent_id, icon_key) values ('Repentance', prayer_id, 'Hand');
  insert into public.activities (name, parent_id, icon_key) values ('Seeking forgiveness', prayer_id, 'Hand');
  insert into public.activities (name, parent_id, icon_key) values ('Petition/Supplication', prayer_id, 'Hand');
  insert into public.activities (name, parent_id, icon_key) values ('Intercession', prayer_id, 'Hand');
  insert into public.activities (name, parent_id, icon_key) values ('Contemplation', prayer_id, 'Hand');

  insert into public.activities (name, category_id, icon_key, entry_mode)
  values ('Sermons', 'nature', 'Church', 'quick_log');

  insert into public.activities (name, category_id, icon_key, entry_mode)
  values ('Worship', 'nature', 'Music4', 'quick_log');
end $$;

update public.activities
set name = 'Main sleep'
where name = 'Night sleep'
  and parent_id = (select id from public.activities where name = 'Sleep' and parent_id is null);
