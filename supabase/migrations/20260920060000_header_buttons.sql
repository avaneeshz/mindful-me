-- Full user customization of the header buttons (HEADER-CUSTOM-1).
--
-- Replaces the CONFIGURATION half of three previously-unrelated hardcoded
-- systems — `domain/displayButtons.ts`'s `DISPLAY_BUTTONS`, `domain/notes.ts`'s
-- `NOTE_BUTTONS`, and `SupplementsButton.tsx`'s 7-item list — with one table,
-- `header_buttons` (+ child tables for the per-category config that isn't a
-- single scalar). The INSTANCE-DATA tables those three systems already write
-- to (`note_entries`, `daily_values`, `supplement_completions`,
-- `scheduled_activities`) are UNCHANGED in shape by this file — see
-- `20260920070000_header_buttons_validation.sql` for the one small, additive
-- exception (`supplement_completions.header_button_id`, needed once more than
-- one checklist can exist) and for moving their CHECK-constraint validation
-- onto this new config table via triggers.
--
-- Four categories (`category`), matching the full-stack-engineer agent
-- definition's brief exactly:
--   'activity'  — points at an EXISTING top-level `public.activities` row
--                 (`activity_id`). The type selector's options still come
--                 from that same activity's own `sub` list on the CLIENT
--                 (`data/activities.ts`) — never a new subtype table, exactly
--                 as scoped. `entry_mode` covers the two existing entry
--                 shapes (`'duration'` — Start/End; `'song_count'` — Worship's
--                 Start + song count) rather than baking `'song_count'` in as
--                 a one-off Worship special case forever, but the add-button
--                 FORM only ever offers `'duration'` for a NEW button — no
--                 product ask exists yet for a user-facing "song count" entry
--                 mode, so this stays a seed-only value for now (see the
--                 report this migration ships with for the full reasoning).
--   'checklist' — a list of item labels (`header_button_checklist_items`),
--                 generalizing the old fixed 7-item Supplements list to any
--                 number of user-defined checklists.
--   'notes'     — a freeform note field with an optional type vocabulary
--                 (`header_button_note_types`), generalizing
--                 `NOTE_BUTTON_TYPES`.
--   'day_value' — a plain per-day number (Steps/Protein's existing shape):
--                 `day_value_unit` ('min'/'int'/'target') + optional
--                 `day_value_target`.
--
-- `created_by` — nullable, mirrors `activities.created_by`'s own convention
-- exactly (see `20260826060000_activities.sql` or thereabouts): NULL is a
-- system default visible to every user, a real user id is that user's own
-- addition, visible only to them. A user's effective button list is system
-- defaults (not hidden by them) plus their own rows, in their own chosen
-- order — computed by `list_header_buttons()` below, never duplicated in
-- application code.
--
-- Rename safety (the brief's explicit audit ask): `label` is never used as a
-- storage key anywhere in this schema or the client that reads it — the
-- stable identity is always `id` (this row), `key` (notes/day_value — what
-- `note_entries.button_key`/`daily_values.metric_key` actually store), or
-- `activity_id` (activity — history is keyed to the ACTIVITY, not to this
-- button row, so an activity-category button carries no storage key at all;
-- `key` stays null for it). Renaming a button is therefore always just
-- `update_header_button`'s `p_label` — never a data migration.
--
-- Judgment call (flagged per the agent definition's own instruction, see the
-- PR description for the fuller version): CATEGORY, `activity_id`, `key` and
-- `day_value_unit` are fixed at creation — only label/notes-config/
-- checklist-items/day-value-target are editable afterward. The safer default
-- the brief itself suggested. A second call: editing (rename/reconfigure) a
-- SYSTEM DEFAULT button is not offered at all in this pass — that row is
-- shared by every user, so an in-place edit would violate "must never affect
-- other users" the same way a hard delete would. `update_header_button` below
-- only ever succeeds for a caller's OWN row (`created_by = auth.uid()`); a
-- system default can be hidden and a new, fully-custom button added in its
-- place, but not edited in place.
create table public.header_buttons (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete cascade,
  category text not null check (category in ('activity', 'checklist', 'notes', 'day_value')),
  -- Storage key for 'notes' (-> note_entries.button_key) and 'day_value'
  -- (-> daily_values.metric_key). Null for 'activity' (storage keys off
  -- activity_id, not this row) and 'checklist' (storage keys off each
  -- child item's own item_key, not the button).
  key text,
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0,
  -- 'activity' config.
  activity_id uuid references public.activities (id),
  entry_mode text not null default 'duration' check (entry_mode in ('duration', 'song_count')),
  quick_log_type boolean not null default false,
  quick_log_type_label text,
  -- Sleep's "How was your sleep?" 11-value vocabulary stays a fixed,
  -- hardcoded client-side enum (`SleepQualityId` in domain/types.ts) — the
  -- smaller-blast-radius call the brief explicitly sanctioned. This column
  -- only generalizes WHETHER a button opts into that fixed picker, so any
  -- activity-category button could show it, not only the one named 'Sleep'.
  quick_log_sleep_quality boolean not null default false,
  -- 'day_value' config.
  day_value_unit text check (day_value_unit in ('min', 'int', 'target')),
  day_value_target numeric,
  -- Seed-only: a system default that exists purely so the trigger-based
  -- validation in the next migration can still accept every value the old
  -- CHECK constraints accepted (rule: never lose meaning for existing rows),
  -- without cluttering a new user's button row with retired buttons nobody
  -- writes to any more. `list_header_buttons()` folds this into `hidden`
  -- exactly like a per-user hide, except it's the SHARED starting state
  -- before any per-user override.
  default_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint header_buttons_activity_requires_activity_id check (
    category <> 'activity' or activity_id is not null
  ),
  constraint header_buttons_day_value_requires_unit check (
    category <> 'day_value' or day_value_unit is not null
  ),
  constraint header_buttons_day_value_target_requires_target check (
    day_value_unit is distinct from 'target' or day_value_target is not null
  ),
  constraint header_buttons_key_required_for_key_categories check (
    category not in ('notes', 'day_value') or (key is not null and btrim(key) <> '')
  ),
  constraint header_buttons_key_only_for_key_categories check (
    category in ('notes', 'day_value') or key is null
  ),
  constraint header_buttons_activity_only_for_activity check (
    category = 'activity' or (activity_id is null and quick_log_type is not true and quick_log_sleep_quality is not true)
  )
);

-- `key` is the stable identity `note_entries`/`daily_values` validate
-- against — unique per scope (system-wide among defaults, per-user among a
-- user's own rows), same "system default OR own row" scoping every RLS
-- policy below uses. Two different users may each own a button with the same
-- key text (e.g. two people both add a 'day_value' button and the client
-- happens to generate the same slug) without colliding.
create unique index header_buttons_key_scope_idx
  on public.header_buttons (coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid), key)
  where key is not null;

create index header_buttons_created_by_idx on public.header_buttons (created_by);

create or replace function public.set_header_buttons_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger header_buttons_set_updated_at
  before update on public.header_buttons
  for each row execute function public.set_header_buttons_updated_at();

alter table public.header_buttons enable row level security;

create policy "read system default or own header buttons"
  on public.header_buttons for select
  to authenticated
  using (created_by is null or created_by = (select auth.uid()));

create policy "insert own header buttons"
  on public.header_buttons for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "update own header buttons"
  on public.header_buttons for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- No delete policy, deliberately — see the top-of-file note: removing a
-- button is ALWAYS a per-user hide (`header_button_user_state` below), never
-- a delete of the shared config row, even for a button the caller owns. This
-- sidesteps needing an "only if no history exists" check entirely (rule 11's
-- own reasoning, applied to config rather than instance data) — a hard
-- delete RPC may be added later if a real product need for one shows up.

-- --- 'activity' category: optional note field(s) (generalizes Sleep's old
-- hardcoded quickLogNote/quickLogDreamsNote pair). `field_key` is
-- deliberately a closed 2-value set, not a free string — every activity-
-- backed logged instance (`scheduled_activities`) only ever has two
-- generic note-shaped columns to write into (`notes_encrypted`,
-- `dreams_encrypted` — see that table's own migration), so "any button can
-- have zero, one, or more named note fields" is generalized as far as the
-- underlying storage actually allows: up to two, freely labeled and
-- optional, not unlimited. Documented explicitly as a judgment call in the
-- PR this migration ships with. `label` is what the client shows
-- ("Note"/"Dreams" today, anything else for a new button); `field_key` is
-- what tells the client WHICH of the two physical columns to write.
create table public.header_button_note_fields (
  id uuid primary key default gen_random_uuid(),
  header_button_id uuid not null references public.header_buttons (id) on delete cascade,
  field_key text not null check (field_key in ('primary', 'secondary')),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0,
  unique (header_button_id, field_key)
);

-- --- 'notes' category: optional type vocabulary (generalizes
-- `NOTE_BUTTON_TYPES`'s per-button optional list — gifts -> GIFT_TYPES,
-- learnings -> LEARNING_TYPES today).
create table public.header_button_note_types (
  id uuid primary key default gen_random_uuid(),
  header_button_id uuid not null references public.header_buttons (id) on delete cascade,
  value text not null check (btrim(value) <> ''),
  sort_order integer not null default 0,
  unique (header_button_id, value)
);

-- --- 'checklist' category: the item list (generalizes the old fixed
-- 7-item Supplements list). `item_key` is the stable identity
-- `supplement_completions.item_key` validates against — see the next
-- migration.
create table public.header_button_checklist_items (
  id uuid primary key default gen_random_uuid(),
  header_button_id uuid not null references public.header_buttons (id) on delete cascade,
  item_key text not null check (btrim(item_key) <> ''),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0,
  unique (header_button_id, item_key)
);

alter table public.header_button_note_fields enable row level security;
alter table public.header_button_note_types enable row level security;
alter table public.header_button_checklist_items enable row level security;

-- Same "system default OR own row" scoping as the parent table, joined
-- through it — read follows the parent's visibility; write only ever
-- succeeds for the caller's own button (system-default children are seeded
-- by this migration running as the table owner, never through these
-- policies).
create policy "read child rows of visible header buttons"
  on public.header_button_note_fields for select to authenticated
  using (exists (
    select 1 from public.header_buttons hb
    where hb.id = header_button_id and (hb.created_by is null or hb.created_by = (select auth.uid()))
  ));
create policy "write child rows of own header buttons"
  on public.header_button_note_fields for all to authenticated
  using (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())))
  with check (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())));

create policy "read child rows of visible header buttons"
  on public.header_button_note_types for select to authenticated
  using (exists (
    select 1 from public.header_buttons hb
    where hb.id = header_button_id and (hb.created_by is null or hb.created_by = (select auth.uid()))
  ));
create policy "write child rows of own header buttons"
  on public.header_button_note_types for all to authenticated
  using (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())))
  with check (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())));

create policy "read child rows of visible header buttons"
  on public.header_button_checklist_items for select to authenticated
  using (exists (
    select 1 from public.header_buttons hb
    where hb.id = header_button_id and (hb.created_by is null or hb.created_by = (select auth.uid()))
  ));
create policy "write child rows of own header buttons"
  on public.header_button_checklist_items for all to authenticated
  using (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())))
  with check (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())));

-- --- Per-user overlay: hide/reorder, never a delete or a shared edit. -----
create table public.header_button_user_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  header_button_id uuid not null references public.header_buttons (id) on delete cascade,
  hidden boolean not null default false,
  -- Null = "use the button's own default order" — only set once the user
  -- has actually reordered something, so most rows never need one.
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, header_button_id)
);

create or replace function public.set_header_button_user_state_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger header_button_user_state_set_updated_at
  before update on public.header_button_user_state
  for each row execute function public.set_header_button_user_state_updated_at();

alter table public.header_button_user_state enable row level security;

create policy "read own header button state"
  on public.header_button_user_state for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own header button state"
  on public.header_button_user_state for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own header button state"
  on public.header_button_user_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Seed migration — the CURRENT hardcoded config, verbatim: same keys, same
-- labels, same order, all `created_by is null` system defaults. On day one
-- an existing user sees the exact same button set in the exact same order as
-- before (additive capability, not a reset) — see the report this migration
-- ships with for the row-by-row mapping back to `DISPLAY_BUTTONS`/
-- `NOTE_BUTTONS`/`SupplementsButton.tsx`.
-- ===========================================================================

-- Row 2's render order today: the 4 shown NOTE_BUTTONS, then the 9
-- DISPLAY_BUTTONS, then Supplements — `sort_order` mirrors that exactly.
insert into public.header_buttons (category, key, label, sort_order) values
  ('notes', 'gifts', 'Extra Senses', 0),
  ('notes', 'learnings', 'Learnings', 1),
  ('notes', 'mirror', 'Relational Nutrient', 2),
  ('notes', 'scriptures', 'Scriptures', 3);

insert into public.header_button_note_types (header_button_id, value, sort_order)
select hb.id, v.value, v.ord
from public.header_buttons hb
join (values
  ('gifts', 'Dreamer', 0), ('gifts', 'The Voice', 1), ('gifts', 'The Knower', 2),
  ('gifts', 'Memory Bank', 3), ('gifts', 'Amplifier', 4),
  ('learnings', 'Given', 0), ('learnings', 'Realized', 1), ('learnings', 'Revealed', 2)
) as v(key, value, ord) on v.key = hb.key
where hb.category = 'notes' and hb.created_by is null;

-- The 5 retired `note_entries.button_key` values (Chits/Opportunities moved
-- to the inert sidebar; Prayer/Sermons/Worship promoted to activity-backed
-- quick-log buttons) — seeded ONLY so the next migration's trigger-based
-- validation still accepts every value the old CHECK constraint accepted
-- (see `default_hidden`'s own doc comment above). Nothing writes to
-- `note_entries` under these keys any more (confirmed: no client code path
-- calls `create_note_entry` for any of them today), so this is pure
-- backward-compatibility plumbing, not a re-activation of these buttons.
insert into public.header_buttons (category, key, label, sort_order, default_hidden) values
  ('notes', 'chits', 'Chits', 100, true),
  ('notes', 'opportunities', 'Opportunities', 101, true),
  ('notes', 'prayer', 'Prayer (legacy note)', 102, true),
  ('notes', 'summons', 'Sermons (legacy note)', 103, true),
  ('notes', 'worship', 'Worship (legacy note)', 104, true);

-- Quick-log ('activity') buttons — activity_id resolved by NAME against the
-- already-seeded catalog (never a hardcoded id, so this migration is
-- portable across projects/environments).
insert into public.header_buttons (
  category, label, sort_order, activity_id, entry_mode, quick_log_type, quick_log_type_label, quick_log_sleep_quality
)
select 'activity', v.label, v.sort_order, a.id, v.entry_mode, v.quick_log_type, v.quick_log_type_label, v.quick_log_sleep_quality
from (values
  ('Vipassana', 4, 'Vipassana', 'duration', false, null::text, false),
  ('Sports or Exercise', 6, 'Exercise', 'duration', true, 'Type', false),
  ('Breathwork', 7, 'Breathing', 'duration', true, 'Type', false),
  ('Sleep', 8, 'Sleep', 'duration', true, 'Sleep type', true),
  ('Prayer', 9, 'Prayer', 'duration', true, 'Type', false),
  ('Sermons', 10, 'Sermons', 'duration', false, null::text, false),
  ('Worship', 11, 'Worship', 'song_count', false, null::text, false)
) as v(activity_name, sort_order, label, entry_mode, quick_log_type, quick_log_type_label, quick_log_sleep_quality)
join public.activities a on a.name = v.activity_name and a.parent_id is null;

-- Note fields per quick-log button — every one of the 6 with `quickLogNote:
-- true` gets a single "Note" field; Sleep additionally gets "Dreams". Worship
-- and Sermons currently carry `quickLogNote: true` too (see
-- `domain/displayButtons.ts`) — Vipassana is the one exception (no note field
-- today).
insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
select hb.id, 'primary', 'Note', 0
from public.header_buttons hb
join public.activities a on a.id = hb.activity_id
where hb.category = 'activity' and hb.created_by is null and a.name <> 'Vipassana';

insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
select hb.id, 'secondary', 'Dreams', 1
from public.header_buttons hb
join public.activities a on a.id = hb.activity_id
where hb.category = 'activity' and hb.created_by is null and a.name = 'Sleep';

-- Day-value buttons — Steps, Protein.
insert into public.header_buttons (category, key, label, sort_order, day_value_unit, day_value_target) values
  ('day_value', 'steps', 'Steps', 5, 'int', null),
  ('day_value', 'protein', 'Protein', 12, 'target', 80);

-- Checklist — Supplements, the 7 fixed items, verbatim (same keys, same
-- labels, same order as `SUPPLEMENT_ITEMS` in `domain/supplements.ts`).
insert into public.header_buttons (category, label, sort_order) values ('checklist', 'Supplements', 13);

insert into public.header_button_checklist_items (header_button_id, item_key, label, sort_order)
select hb.id, v.item_key, v.label, v.ord
from public.header_buttons hb
join (values
  ('zinc', 'Zinc (post-breakfast)', 0),
  ('omega', 'Omega (post-lunch)', 1),
  ('magnesium', 'Magnesium (post-dinner)', 2),
  ('ayurveda_skin', 'Ayurveda — skin healing', 3),
  ('ayurveda_fibroid', 'Ayurveda — fibroid healing', 4),
  ('ayurveda_varicose', 'Ayurveda — varicose veins', 5),
  ('multivitamin', 'MultiVitamin (on Chums days)', 6)
) as v(item_key, label, ord) on true
where hb.category = 'checklist' and hb.created_by is null and hb.label = 'Supplements';

-- Seed sanity check — fail the migration loudly rather than silently if the
-- row-for-row mapping above didn't land the way it was meant to (e.g. a
-- catalog name mismatch that would otherwise seed nothing for one button).
do $$
declare
  v_activity_count integer;
  v_note_count integer;
  v_day_value_count integer;
  v_checklist_items integer;
begin
  select count(*) into v_activity_count from public.header_buttons where category = 'activity' and created_by is null;
  select count(*) into v_note_count from public.header_buttons where category = 'notes' and created_by is null and default_hidden = false;
  select count(*) into v_day_value_count from public.header_buttons where category = 'day_value' and created_by is null;
  select count(*) into v_checklist_items from public.header_button_checklist_items ci
    join public.header_buttons hb on hb.id = ci.header_button_id
    where hb.category = 'checklist' and hb.created_by is null;

  if v_activity_count <> 7 then
    raise exception 'header_buttons seed: expected 7 system-default activity buttons, got %', v_activity_count;
  end if;
  if v_note_count <> 4 then
    raise exception 'header_buttons seed: expected 4 visible system-default notes buttons, got %', v_note_count;
  end if;
  if v_day_value_count <> 2 then
    raise exception 'header_buttons seed: expected 2 system-default day_value buttons, got %', v_day_value_count;
  end if;
  if v_checklist_items <> 7 then
    raise exception 'header_buttons seed: expected 7 Supplements checklist items, got %', v_checklist_items;
  end if;
end $$;

-- ===========================================================================
-- RPCs
-- ===========================================================================

-- The effective per-user list: system defaults (folding in `default_hidden`
-- as the shared starting hidden-state) plus the caller's own rows, each
-- overlaid with the caller's own hide/reorder state. Returns EVERY row
-- (hidden included) — the client splits visible vs. hidden itself, so edit
-- mode can offer "unhide" instead of a hide being a dead end.
create or replace function public.list_header_buttons()
returns table (
  id uuid,
  category text,
  key text,
  label text,
  is_system_default boolean,
  sort_order numeric,
  hidden boolean,
  activity_id uuid,
  activity_name text,
  entry_mode text,
  quick_log_type boolean,
  quick_log_type_label text,
  quick_log_sleep_quality boolean,
  day_value_unit text,
  day_value_target numeric,
  note_fields jsonb,
  note_types jsonb,
  checklist_items jsonb
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    hb.id,
    hb.category,
    hb.key,
    hb.label,
    (hb.created_by is null) as is_system_default,
    coalesce(us.sort_order, hb.sort_order)::numeric as sort_order,
    coalesce(us.hidden, hb.default_hidden) as hidden,
    hb.activity_id,
    a.name as activity_name,
    hb.entry_mode,
    hb.quick_log_type,
    hb.quick_log_type_label,
    hb.quick_log_sleep_quality,
    hb.day_value_unit,
    hb.day_value_target,
    coalesce((
      select jsonb_agg(jsonb_build_object('key', nf.field_key, 'label', nf.label) order by nf.sort_order)
      from public.header_button_note_fields nf where nf.header_button_id = hb.id
    ), '[]'::jsonb) as note_fields,
    coalesce((
      select jsonb_agg(nt.value order by nt.sort_order)
      from public.header_button_note_types nt where nt.header_button_id = hb.id
    ), '[]'::jsonb) as note_types,
    coalesce((
      select jsonb_agg(jsonb_build_object('key', ci.item_key, 'label', ci.label) order by ci.sort_order)
      from public.header_button_checklist_items ci where ci.header_button_id = hb.id
    ), '[]'::jsonb) as checklist_items
  from public.header_buttons hb
  left join public.activities a on a.id = hb.activity_id
  left join public.header_button_user_state us on us.header_button_id = hb.id and us.user_id = auth.uid()
  where hb.created_by is null or hb.created_by = auth.uid()
  order by coalesce(us.hidden, hb.default_hidden), coalesce(us.sort_order, hb.sort_order), hb.created_at;
$$;

revoke all on function public.list_header_buttons() from public, anon;
grant execute on function public.list_header_buttons() to authenticated;

-- Creates a user-owned button. `p_id` may be client-supplied (same
-- idempotent-retry convention `create_scheduled_activity` already
-- established) so a dropped-connection retry from the local-first sync
-- layer never creates a duplicate. Category is fixed forever once created —
-- see the top-of-file judgment-call note.
create or replace function public.create_header_button(
  p_category text,
  p_label text,
  p_id uuid default null,
  p_key text default null,
  p_activity_id uuid default null,
  p_entry_mode text default 'duration',
  p_quick_log_type boolean default false,
  p_quick_log_type_label text default null,
  p_quick_log_sleep_quality boolean default false,
  p_day_value_unit text default null,
  p_day_value_target numeric default null,
  p_note_fields jsonb default '[]'::jsonb,
  p_note_types jsonb default '[]'::jsonb,
  p_checklist_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_sort_order integer;
  v_item jsonb;
  v_item_key text;
  v_seen text[] := '{}';
  v_inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_category not in ('activity', 'checklist', 'notes', 'day_value') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  if p_category = 'activity' then
    if p_activity_id is null then
      raise exception 'activity_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.activities where id = p_activity_id and parent_id is null) then
      raise exception 'invalid_activity' using errcode = '22023';
    end if;
    if p_entry_mode not in ('duration', 'song_count') then
      raise exception 'invalid_entry_mode' using errcode = '22023';
    end if;
    v_key := null;
  elsif p_category = 'day_value' then
    if p_day_value_unit not in ('min', 'int', 'target') then
      raise exception 'invalid_day_value_unit' using errcode = '22023';
    end if;
    if p_day_value_unit = 'target' and p_day_value_target is null then
      raise exception 'target_required' using errcode = '22023';
    end if;
    if v_key is null then
      v_key := 'user_' || replace(gen_random_uuid()::text, '-', '');
    end if;
  elsif p_category = 'notes' then
    if v_key is null then
      v_key := 'user_' || replace(gen_random_uuid()::text, '-', '');
    end if;
  else
    v_key := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from public.header_buttons
  where created_by = auth.uid();

  insert into public.header_buttons (
    id, created_by, category, key, label, sort_order, activity_id, entry_mode,
    quick_log_type, quick_log_type_label, quick_log_sleep_quality, day_value_unit, day_value_target
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_category, v_key, btrim(p_label), v_sort_order, p_activity_id,
    coalesce(p_entry_mode, 'duration'), coalesce(p_quick_log_type, false), p_quick_log_type_label,
    coalesce(p_quick_log_sleep_quality, false), p_day_value_unit, p_day_value_target
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Idempotent retry landed on an id that already exists — return it as-is
    -- (mirrors `create_scheduled_activity`'s own retry handling) rather than
    -- erroring or creating a duplicate.
    if p_id is not null then
      select id into v_id from public.header_buttons where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_header_button_failed' using errcode = 'P0001';
  end if;

  if p_category = 'activity' then
    insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
    select v_id, (elem ->> 'key'), btrim(elem ->> 'label'), ord - 1
    from jsonb_array_elements(coalesce(p_note_fields, '[]'::jsonb)) with ordinality as t (elem, ord)
    where (elem ->> 'key') in ('primary', 'secondary') and btrim(coalesce(elem ->> 'label', '')) <> '';
  end if;

  if p_category = 'notes' then
    insert into public.header_button_note_types (header_button_id, value, sort_order)
    select v_id, btrim(elem), ord - 1
    from jsonb_array_elements_text(coalesce(p_note_types, '[]'::jsonb)) with ordinality as t (elem, ord)
    where btrim(elem) <> '';
  end if;

  if p_category = 'checklist' then
    for v_item in select * from jsonb_array_elements(coalesce(p_checklist_items, '[]'::jsonb))
    loop
      v_item_key := lower(regexp_replace(btrim(coalesce(v_item ->> 'label', '')), '[^a-zA-Z0-9]+', '_', 'g'));
      v_item_key := trim(both '_' from v_item_key);
      if v_item_key = '' then
        continue;
      end if;
      if v_item_key = any (v_seen) then
        v_item_key := v_item_key || '_' || substr(md5(random()::text), 1, 4);
      end if;
      v_seen := array_append(v_seen, v_item_key);
      insert into public.header_button_checklist_items (header_button_id, item_key, label, sort_order)
      values (v_id, v_item_key, btrim(v_item ->> 'label'), array_length(v_seen, 1) - 1);
      v_inserted := true;
    end loop;
    if not v_inserted then
      raise exception 'checklist_items_required' using errcode = '22023';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, boolean, text, numeric, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, boolean, text, numeric, jsonb, jsonb, jsonb
) to authenticated;

-- Renames/reconfigures a button the caller owns — never a system default
-- (see the top-of-file judgment-call note). Category, `key`, `activity_id`
-- and `day_value_unit` are immutable; note fields / note types / checklist
-- items are replaced wholesale, the same "delete then reinsert" convention
-- `set_scheduled_activity_reflections` already uses for its own child rows.
create or replace function public.update_header_button(
  p_id uuid,
  p_label text,
  p_quick_log_type_label text default null,
  p_quick_log_sleep_quality boolean default null,
  p_day_value_target numeric default null,
  p_note_fields jsonb default null,
  p_note_types jsonb default null,
  p_checklist_items jsonb default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.header_buttons;
  v_item jsonb;
  v_item_key text;
  v_seen text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from public.header_buttons where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'header_button_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  update public.header_buttons set
    label = btrim(p_label),
    quick_log_type_label = case when v_row.category = 'activity' then coalesce(p_quick_log_type_label, quick_log_type_label) else quick_log_type_label end,
    quick_log_sleep_quality = case when v_row.category = 'activity' then coalesce(p_quick_log_sleep_quality, quick_log_sleep_quality) else quick_log_sleep_quality end,
    day_value_target = case when v_row.category = 'day_value' then coalesce(p_day_value_target, day_value_target) else day_value_target end
  where id = p_id;

  if v_row.category = 'activity' and p_note_fields is not null then
    delete from public.header_button_note_fields where header_button_id = p_id;
    insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
    select p_id, (elem ->> 'key'), btrim(elem ->> 'label'), ord - 1
    from jsonb_array_elements(p_note_fields) with ordinality as t (elem, ord)
    where (elem ->> 'key') in ('primary', 'secondary') and btrim(coalesce(elem ->> 'label', '')) <> '';
  end if;

  if v_row.category = 'notes' and p_note_types is not null then
    delete from public.header_button_note_types where header_button_id = p_id;
    insert into public.header_button_note_types (header_button_id, value, sort_order)
    select p_id, btrim(elem), ord - 1
    from jsonb_array_elements_text(p_note_types) with ordinality as t (elem, ord)
    where btrim(elem) <> '';
  end if;

  if v_row.category = 'checklist' and p_checklist_items is not null then
    delete from public.header_button_checklist_items where header_button_id = p_id;
    for v_item in select * from jsonb_array_elements(p_checklist_items)
    loop
      -- An existing item keeps its own `key` (never re-derived from the
      -- label) so history under it keeps meaning; a genuinely new item (no
      -- `key` in the payload) gets one slugified from its label, same as
      -- `create_header_button`.
      v_item_key := nullif(btrim(coalesce(v_item ->> 'key', '')), '');
      if v_item_key is null then
        v_item_key := lower(regexp_replace(btrim(coalesce(v_item ->> 'label', '')), '[^a-zA-Z0-9]+', '_', 'g'));
        v_item_key := trim(both '_' from v_item_key);
      end if;
      if v_item_key = '' or v_item_key is null then
        continue;
      end if;
      if v_item_key = any (v_seen) then
        v_item_key := v_item_key || '_' || substr(md5(random()::text), 1, 4);
      end if;
      v_seen := array_append(v_seen, v_item_key);
      insert into public.header_button_checklist_items (header_button_id, item_key, label, sort_order)
      values (p_id, v_item_key, btrim(v_item ->> 'label'), array_length(v_seen, 1) - 1);
    end loop;
    if array_length(v_seen, 1) is null then
      raise exception 'checklist_items_required' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function public.update_header_button(uuid, text, text, boolean, numeric, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_header_button(uuid, text, text, boolean, numeric, jsonb, jsonb, jsonb) to authenticated;

-- Hide/unhide — works for a system default (creates/updates the caller's own
-- overlay row) exactly the same as for the caller's own button.
create or replace function public.set_header_button_hidden(
  p_header_button_id uuid,
  p_hidden boolean
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.header_buttons
    where id = p_header_button_id and (created_by is null or created_by = auth.uid())
  ) then
    raise exception 'header_button_not_found' using errcode = 'P0002';
  end if;

  insert into public.header_button_user_state (user_id, header_button_id, hidden)
  values (auth.uid(), p_header_button_id, coalesce(p_hidden, false))
  on conflict (user_id, header_button_id) do update set hidden = excluded.hidden;
end;
$$;

revoke all on function public.set_header_button_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_header_button_hidden(uuid, boolean) to authenticated;

-- The caller's own chosen order — one full reorder, not a per-row move, to
-- keep "make room between two buttons" trivial on the client (recompute the
-- whole array, send it once) rather than needing fractional sort keys.
create or replace function public.reorder_header_buttons(
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
    if not exists (
      select 1 from public.header_buttons
      where id = v_id and (created_by is null or created_by = auth.uid())
    ) then
      raise exception 'invalid_header_button_id' using errcode = '22023';
    end if;

    insert into public.header_button_user_state (user_id, header_button_id, sort_order)
    values (auth.uid(), v_id, v_position)
    on conflict (user_id, header_button_id) do update set sort_order = excluded.sort_order;

    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_header_buttons(uuid[]) from public, anon;
grant execute on function public.reorder_header_buttons(uuid[]) to authenticated;
