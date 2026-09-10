-- Fold Vipassana, Sun Exposure and Moon Exposure into the real
-- activities/scheduled_activities engine, retiring their separate
-- local-only storage (sunMoonLogLocalStore.ts, the Vipassana half of
-- displayValuesLocalStore.ts — see the full-stack-engineer agent
-- definition's Phase 2 scope).
--
-- `entry_mode` is the one new column this needs: it lets the client tell a
-- normal grid-scheduled activity apart from one of these three, which route
-- through a quick "type a start/end time" popover instead of the full
-- tile-row/duration-drag-block picker. Nothing else about how these rows are
-- stored changes — a Vipassana sit or a Sun/Moon exposure stretch is just an
-- ordinary `scheduled_activities` row (real start_at/duration_minutes,
-- subject to the exact same no-overlap constraint as everything else), so
-- "multiple sessions per day, kept in history" and "the button shows a
-- computed SUM(duration_minutes) for today" both fall out of the existing
-- engine for free — no new log table, no separately-stored total.
--
-- 'Vipassana' already exists as a system-default top-level card (seeded by
-- the original catalog migration, recategorized to 'movement' by
-- 20260829090000) — this only flips its `entry_mode`, it does not touch its
-- id, name or category. Sun Exposure / Moon Exposure are genuinely new
-- system-default rows. `Steps` is intentionally untouched: it stays the
-- local-only plain counter it always was (not a time-blocked activity, out
-- of scope per the agent definition's own instruction not to scope-creep).
alter table public.activities
  add column entry_mode text not null default 'schedule'
  check (entry_mode in ('schedule', 'quick_log'));

update public.activities set entry_mode = 'quick_log' where name = 'Vipassana' and parent_id is null;

insert into public.activities (name, category_id, icon_key, entry_mode)
values
  ('Sun Exposure', 'nature', 'Sun', 'quick_log'),
  ('Moon Exposure', 'nature', 'Moon', 'quick_log');
