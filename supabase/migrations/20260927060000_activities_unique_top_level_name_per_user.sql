-- Found in code review (pre-existing gap from PICKER-CUSTOM-1, PR #35/#36,
-- not introduced by this round's dialog/vocabulary work — fixed here at the
-- user's request before merging to `develop` rather than as a separate
-- follow-up): nothing prevents two different top-level activities, in two
-- different tiles, from sharing the same name for one user.
--
-- `activities_parent_id_name_key` (`unique (parent_id, name)`, the original
-- `20260826063100_activities_catalog.sql`) looks like it should catch this,
-- but doesn't: Postgres treats every NULL as distinct from every other NULL
-- in a unique constraint, and a top-level activity's `parent_id` is NULL by
-- definition — two rows with `parent_id is null` and the same `name` both
-- satisfy that constraint regardless of whose they are or what `name` is.
--
-- Why this is a real, not merely cosmetic, bug: every name-keyed lookup this
-- codebase has built on top of "a user's own top-level activity names are
-- unique" silently picks ONE of the colliding rows and uses ITS id —
-- `api/catalog.ts`'s `catalogIdForName` (which `scheduled_activities.
-- activity_id` resolution for LOGGING an activity goes through) and
-- `data/activities.ts`'s live `liveCardsByName` both build a plain
-- `Map<name, ...>`, last-write-wins, across ALL of a user's tiles combined.
-- Two top-level activities named "Walk" in different tiles means logging
-- either one can silently attribute history to the OTHER one's `activities.
-- id` — not just a wrong icon, a wrong permanent record.
--
-- Fix, scoped narrowly (per the brief — NOT reworking the whole staging
-- model to be id-based, which would be a much larger, riskier change
-- touching drag-and-drop/the reducer/sync for a problem this fully closes
-- without it):
-- 1. A data-cleanup pass (below) resolving any duplicates that may already
--    exist, followed by a real DB constraint — a partial unique index on
--    (created_by, name) where parent_id is null. Scoped to `created_by` (a
--    real, non-null uuid for every user-created row — `create_activity`
--    always sets it to `auth.uid()`) so it only ever governs ONE user's own
--    top-level names against each other; the legacy shared catalog
--    (`created_by is null`) is exempt the same way every OTHER unique-ness
--    concern in this schema already treats it (NULL created_by rows are
--    mutually non-colliding under this index too, same NULL-distinctness
--    reasoning as `activities_parent_id_name_key` itself — harmless, since
--    users never create/rename THOSE rows, only their own).
-- 2. `create_activity`/`update_activity` now translate a violation of
--    EITHER unique index (this new one, or the pre-existing sibling-name
--    one) into a friendly, distinguishable exception instead of letting a
--    raw 23505 bubble up — the sibling-name case had no friendly handling
--    either before this, a related pre-existing gap fixed here since this
--    migration already has to touch both functions' insert/update
--    statements to add the new translation.
-- 3. The CLIENT-side fix (the one that actually stops a user from ever
--    reaching this in normal use — this DB constraint is the safety net
--    behind it, per rule 1's "enforce in the DB too, never rely on only one
--    layer," not the primary UX) is in `ActivityTree.tsx`'s add/rename
--    forms for a TOP-LEVEL activity, and in `ActivityLibraryPanel.tsx`'s
--    unrelated-instance-of-the-same-root-problem
--    (`.find(a => a.name === path[0] && a.parentId === null)`, replaced with
--    a real id-walk, `pickerHierarchy.ts`'s new `tileIdForActivity`) — see
--    those files' own comments.
--
-- This migration ALSO relaxes `top_level_has_category` — a second, separate
-- bug this one's own sanity check surfaced (creating a genuinely NEW
-- top-level activity via `create_activity` was failing that constraint
-- outright, blocking enough to fix here — see the comment just above that
-- `alter table` below for the full story). It's applied FIRST, ahead of the
-- dedup pass and the new unique index, because the dedup pass's own
-- self-test (further down) needs to insert genuinely new top-level rows to
-- prove itself against, and those inserts hit this exact constraint
-- otherwise — see that comment for the full story.
-- ===========================================================================
-- A second, unrelated bug surfaced by this migration's own sanity check
-- below, blocking enough that it has to be fixed here too rather than
-- shipped alongside a broken `create_activity` this fix's own verification
-- can't get past: `top_level_has_category` (`20260826063100_activities_
-- catalog.sql`) requires EVERY top-level row, owned or legacy, to carry a
-- non-null `category_id` — a column `20260924061000_activities_
-- customization.sql`'s own doc comment already calls "DEPRECATED —
-- superseded by tile_id," with "a follow-up migration drops it once no code
-- path still reads it" explicitly deferred. `create_activity` (both before
-- and after this migration) has never populated `category_id` for a
-- genuinely NEW top-level activity — only `provision_default_activities()`
-- does, by copying it from the legacy row it clones. The result: every real
-- top-level activity in this project today came from provisioning; a user
-- typing a brand-new top-level activity name through the real UI
-- (`ActivityTree`'s "Add activity", the exact form this migration's own
-- client-side duplicate-name fix touches) has been hitting this constraint
-- and failing outright, with no working path to create one at all.
--
-- Fix: relax the constraint to only require `category_id` for the LEGACY
-- shared catalog (`created_by is null`) — exactly the same shape
-- `owned_top_level_has_tile` already uses for the column that actually
-- replaced it (`created_by is not null or parent_id is not null or tile_id
-- is not null`). No application code reads `category_id` on an owned row
-- (verified: only migrations reference it, all in legacy-seed/provisioning
-- context) — nothing else changes.
-- ===========================================================================
alter table public.activities drop constraint top_level_has_category;
alter table public.activities add constraint top_level_has_category
  check (created_by is not null or parent_id is not null or category_id is not null);

-- ===========================================================================
-- Data cleanup BEFORE the unique index further below is created. Found in
-- code review: `create unique index` fails outright, aborting the whole
-- migration, the moment it finds ANY existing rows that already violate it —
-- and this migration's own top comment already establishes that's a real
-- possibility, not just a theoretical one: PICKER-CUSTOM-1 (this bug's root
-- cause) has been live since PR #35/#36, so even though THIS project has
-- zero duplicate top-level names today (verified directly: `select
-- created_by, name, count(*) from public.activities where parent_id is null
-- and created_by is not null group by created_by, name having count(*) >
-- 1` returns zero rows here), a production user could easily have two
-- top-level activities named the same thing in two different tiles by now.
-- WORKFLOW.md's release process migrates production schema BEFORE code,
-- against live traffic — a migration that can fail outright partway through
-- is exactly what that process forbids.
--
-- Fix: rename every duplicate but the OLDEST one in each (created_by, name)
-- group (oldest by `created_at`, then `id` as a stable tiebreak for ties) to
-- "<name> (2)", "<name> (3)", ... — skipping any suffix that would itself
-- collide with an existing name for that user — never deleting a row, never
-- touching the oldest one's name (so any real, already-in-use reference to
-- the oldest row's original name stays valid). This runs unconditionally
-- every time this migration is applied, so it needs no separate manual
-- pre-migration step and behaves identically wherever it lands — a
-- guaranteed no-op against this project's own real data, and proven against
-- deliberately-duplicated PROBE data by the self-test immediately below,
-- using the exact same algorithm, before the real pass (scoped to the whole
-- table) runs for real just after it.
--
-- Self-test: raw `insert`s (never through `create_activity`, which the
-- unique index — once built — will correctly refuse to let create a true
-- duplicate) create three top-level rows for one throwaway probe user, same
-- name, staggered `created_at`, split across two different tiles — the
-- exact shape the bug above describes. The dedup algorithm below is run
-- scoped to just this probe's `created_by` so this self-test can't touch any
-- other data, then the result is checked before the probe rows are cleaned
-- up.
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_tile_a uuid := gen_random_uuid();
  v_tile_b uuid := gen_random_uuid();
  v_oldest uuid := gen_random_uuid();
  v_middle uuid := gen_random_uuid();
  v_newest uuid := gen_random_uuid();
  v_group record;
  v_dup record;
  v_counter integer;
  v_candidate text;
  v_oldest_name text;
  v_middle_name text;
  v_newest_name text;
  v_distinct_count integer;
begin
  insert into auth.users (id) values (v_probe);
  insert into public.tiles (id, created_by, label, icon_key)
  values
    (v_tile_a, v_probe, 'Dedup Probe A', 'Sun'),
    (v_tile_b, v_probe, 'Dedup Probe B', 'Moon');

  insert into public.activities (id, name, tile_id, parent_id, created_by, created_at)
  values
    (v_oldest, 'Dedup Probe Walk', v_tile_a, null, v_probe, now() - interval '2 days'),
    (v_middle, 'Dedup Probe Walk', v_tile_b, null, v_probe, now() - interval '1 day'),
    (v_newest, 'Dedup Probe Walk', v_tile_a, null, v_probe, now());

  -- The exact same algorithm as the real pass below, scoped to this one
  -- probe user only.
  for v_group in
    select created_by, name
    from public.activities
    where parent_id is null and created_by = v_probe
    group by created_by, name
    having count(*) > 1
  loop
    v_counter := 1;
    for v_dup in
      select id
      from public.activities
      where created_by = v_group.created_by
        and parent_id is null
        and name = v_group.name
      order by created_at asc, id asc
      offset 1
    loop
      loop
        v_counter := v_counter + 1;
        v_candidate := v_group.name || ' (' || v_counter || ')';
        exit when not exists (
          select 1 from public.activities
          where created_by = v_group.created_by and parent_id is null and name = v_candidate
        );
      end loop;
      update public.activities set name = v_candidate where id = v_dup.id;
    end loop;
  end loop;

  select name into v_oldest_name from public.activities where id = v_oldest;
  select name into v_middle_name from public.activities where id = v_middle;
  select name into v_newest_name from public.activities where id = v_newest;

  if v_oldest_name <> 'Dedup Probe Walk' then
    raise exception 'dedup self-test: expected the oldest duplicate to keep its original name, got %', v_oldest_name;
  end if;
  if v_middle_name = 'Dedup Probe Walk' or v_newest_name = 'Dedup Probe Walk' then
    raise exception 'dedup self-test: expected both non-oldest duplicates to be renamed, got % and %', v_middle_name, v_newest_name;
  end if;
  if v_middle_name = v_newest_name then
    raise exception 'dedup self-test: expected the two renamed duplicates to end up with distinct names, both got %', v_middle_name;
  end if;

  select count(distinct name) into v_distinct_count
  from public.activities where id in (v_oldest, v_middle, v_newest);
  if v_distinct_count <> 3 then
    raise exception 'dedup self-test: expected 3 distinct names after dedup, got %', v_distinct_count;
  end if;

  raise notice 'dedup self-test: PASSED (oldest kept "%", others renamed to "%" and "%")', v_oldest_name, v_middle_name, v_newest_name;

  delete from public.activities where created_by = v_probe;
  delete from public.tiles where created_by = v_probe;
  delete from auth.users where id = v_probe;
end $$;

-- The real pass: identical algorithm, scoped over every user's data. A
-- guaranteed no-op today (verified above) — this is what actually protects
-- a future apply of this same migration against production data.
do $$
declare
  v_group record;
  v_dup record;
  v_counter integer;
  v_candidate text;
begin
  for v_group in
    select created_by, name
    from public.activities
    where parent_id is null and created_by is not null
    group by created_by, name
    having count(*) > 1
  loop
    v_counter := 1;
    for v_dup in
      select id
      from public.activities
      where created_by = v_group.created_by
        and parent_id is null
        and name = v_group.name
      order by created_at asc, id asc
      offset 1
    loop
      loop
        v_counter := v_counter + 1;
        v_candidate := v_group.name || ' (' || v_counter || ')';
        exit when not exists (
          select 1 from public.activities
          where created_by = v_group.created_by and parent_id is null and name = v_candidate
        );
      end loop;
      update public.activities set name = v_candidate where id = v_dup.id;
    end loop;
  end loop;
end $$;

create unique index activities_top_level_name_per_user_idx
  on public.activities (created_by, name)
  where parent_id is null;

create or replace function public.create_activity(
  p_name text,
  p_tile_id uuid default null,
  p_parent_id uuid default null,
  p_icon_key text default null,
  p_id uuid default null,
  p_disappear_mode text default 'manual',
  p_disappear_limit integer default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_sort_order integer;
  v_mode text;
  v_limit integer;
  v_constraint text;
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

  if p_parent_id is not null then
    v_mode := 'manual';
    v_limit := null;
  else
    if coalesce(p_disappear_mode, 'manual') not in ('manual', 'auto') then
      raise exception 'invalid_disappear_mode' using errcode = '22023';
    end if;
    if p_disappear_mode = 'auto' and (p_disappear_limit is null or p_disappear_limit < 1) then
      raise exception 'disappear_limit_required' using errcode = '22023';
    end if;
    v_mode := coalesce(p_disappear_mode, 'manual');
    v_limit := case when v_mode = 'auto' then p_disappear_limit else null end;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.activities
  where created_by = auth.uid()
    and tile_id is not distinct from p_tile_id
    and parent_id is not distinct from p_parent_id;

  begin
    insert into public.activities (
      id, name, tile_id, parent_id, icon_key, entry_mode, created_by, sort_order, disappear_mode, disappear_limit
    )
    values (
      coalesce(p_id, gen_random_uuid()), btrim(p_name), p_tile_id, p_parent_id,
      nullif(btrim(coalesce(p_icon_key, '')), ''), 'schedule', auth.uid(), v_sort_order, v_mode, v_limit
    )
    on conflict (id) do nothing
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activities_top_level_name_per_user_idx' then
      raise exception 'duplicate_top_level_name' using errcode = '23505';
    else
      raise exception 'duplicate_sibling_name' using errcode = '23505';
    end if;
  end;

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

create or replace function public.update_activity(
  p_id uuid,
  p_name text,
  p_icon_key text default null,
  p_disappear_mode text default null,
  p_disappear_limit integer default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.activities;
  v_mode text;
  v_limit integer;
  v_icon_key text;
  v_constraint text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;

  select * into v_row from public.activities where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'activity_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  -- Found in code review: this used to unconditionally overwrite icon_key
  -- to NULL whenever p_icon_key was omitted (the exact call shape the only
  -- real caller, `useActivityHierarchy.ts`'s `renameActivity`, has always
  -- used — it renames without ever touching the icon) — silently stripping
  -- every provisioned/default icon the moment a user renamed that activity.
  -- Same "omitting the param leaves the existing value untouched" contract
  -- `disappear_mode`/`disappear_limit` just below already use; an explicit
  -- empty string still clears the icon on purpose.
  if p_icon_key is null then
    v_icon_key := v_row.icon_key;
  else
    v_icon_key := nullif(btrim(p_icon_key), '');
  end if;

  if v_row.parent_id is not null or p_disappear_mode is null then
    -- A drill-down option never carries a disappear rule; omitting the
    -- param on a top-level activity leaves its existing rule untouched.
    v_mode := v_row.disappear_mode;
    v_limit := v_row.disappear_limit;
  else
    if p_disappear_mode not in ('manual', 'auto') then
      raise exception 'invalid_disappear_mode' using errcode = '22023';
    end if;
    if p_disappear_mode = 'auto' and (p_disappear_limit is null or p_disappear_limit < 1) then
      raise exception 'disappear_limit_required' using errcode = '22023';
    end if;
    v_mode := p_disappear_mode;
    v_limit := case when v_mode = 'auto' then p_disappear_limit else null end;
  end if;

  begin
    update public.activities
    set name = btrim(p_name),
        icon_key = v_icon_key,
        disappear_mode = v_mode,
        disappear_limit = v_limit
    where id = p_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activities_top_level_name_per_user_idx' then
      raise exception 'duplicate_top_level_name' using errcode = '23505';
    else
      raise exception 'duplicate_sibling_name' using errcode = '23505';
    end if;
  end;
end;
$$;

-- ===========================================================================
-- Sanity checks — throwaway-probe-user do-block, this codebase's established
-- convention. Exercises the real constraint + friendly-exception behavior
-- through the actual RPCs (the dedup pass itself has its own, separate
-- self-test further up).
-- ===========================================================================
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_tile_a uuid;
  v_tile_b uuid;
  v_first_id uuid;
  v_raised boolean;
  v_message text;
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);

  v_tile_a := public.create_tile('Morning', 'Sun');
  v_tile_b := public.create_tile('Evening', 'Moon');

  v_first_id := public.create_activity(p_name := 'Walk', p_tile_id := v_tile_a);

  -- The exact reported bug: a second top-level activity named "Walk" under a
  -- DIFFERENT tile must now be rejected, not silently created.
  v_raised := false;
  begin
    perform public.create_activity(p_name := 'Walk', p_tile_id := v_tile_b);
  exception when sqlstate '23505' then
    v_raised := true;
    get stacked diagnostics v_message = message_text;
  end;
  if not v_raised then
    raise exception 'duplicate check: expected a second top-level "Walk" under a different tile to be rejected';
  end if;
  if v_message <> 'duplicate_top_level_name' then
    raise exception 'duplicate check: expected the friendly duplicate_top_level_name message, got %', v_message;
  end if;

  -- A SUB-activity may still reuse a top-level name — only the top-level
  -- scope is constrained.
  perform public.create_activity(p_name := 'Walk', p_parent_id := v_first_id);

  -- Renaming a different top-level activity to an already-used name is
  -- rejected the same way.
  declare
    v_second_id uuid;
  begin
    v_second_id := public.create_activity(p_name := 'Run', p_tile_id := v_tile_b);
    v_raised := false;
    begin
      perform public.update_activity(v_second_id, 'Walk');
    exception when sqlstate '23505' then
      v_raised := true;
    end;
    if not v_raised then
      raise exception 'duplicate check: expected renaming "Run" to the already-used "Walk" to be rejected';
    end if;
  end;

  -- Renaming an activity to ITS OWN current name is always a no-op, never a
  -- false-positive collision against itself.
  perform public.update_activity(v_first_id, 'Walk');

  -- icon_key preservation (found in code review: `update_activity` used to
  -- unconditionally overwrite icon_key to NULL whenever p_icon_key was
  -- omitted — exactly what every real caller today does, since
  -- `useActivityHierarchy.ts`'s `renameActivity` never passes one, silently
  -- stripping every provisioned/default icon on the first rename). Omitting
  -- the param must leave the existing icon untouched; an explicit empty
  -- string still clears it on purpose.
  perform public.update_activity(v_first_id, 'Walk', p_icon_key := 'Footprints');
  if (select icon_key from public.activities where id = v_first_id) <> 'Footprints' then
    raise exception 'icon check: expected icon_key to be set to Footprints';
  end if;
  perform public.update_activity(v_first_id, 'Walk on Trail');
  if (select icon_key from public.activities where id = v_first_id) <> 'Footprints' then
    raise exception 'icon check: expected icon_key to survive a rename that omits p_icon_key';
  end if;
  perform public.update_activity(v_first_id, 'Walk on Trail', p_icon_key := '');
  if (select icon_key from public.activities where id = v_first_id) is not null then
    raise exception 'icon check: expected an explicit empty p_icon_key to clear icon_key';
  end if;
  perform public.update_activity(v_first_id, 'Walk');

  -- Two DIFFERENT users may each have their own top-level "Walk" — the
  -- constraint is scoped per user, not global. `insert into auth.users`
  -- needs the elevated (pre-`set_config('role', 'authenticated', ...)`)
  -- role this whole do-block started with, same as `v_probe`'s own insert
  -- above — reset back to it before, and re-impersonate `v_probe` again
  -- after, this nested probe.
  declare
    v_probe_2 uuid := gen_random_uuid();
  begin
    reset role;
    insert into auth.users (id) values (v_probe_2);
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', v_probe_2::text, true);
    perform public.create_tile('Morning', 'Sun');
    perform public.create_activity(p_name := 'Walk', p_tile_id := (select id from public.tiles where created_by = v_probe_2 limit 1));
    delete from public.tiles where created_by = v_probe_2;
    reset role;
    delete from auth.users where id = v_probe_2;
    perform set_config('role', 'authenticated', true);
  end;
  perform set_config('request.jwt.claim.sub', v_probe::text, true);

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.tiles where created_by = v_probe;
  delete from auth.users where id = v_probe;
  raise notice 'activities_unique_top_level_name_per_user: ALL CHECKS PASSED';
end $$;
