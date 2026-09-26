-- Revision to HEADER-CUSTOM-1, after further product-owner discussion:
-- drops the `created_by IS NULL` "shared system default" concept entirely.
-- The product owner was explicit: there is no template/sample vs. live
-- distinction, and no permanent/fixed buttons of any kind. Every
-- `header_buttons` row a user has is unconditionally theirs — rename,
-- reconfigure, or hide it, no exceptions, no special-casing by origin.
--
-- What changes:
--   1. A new `provision_default_header_buttons()` RPC — the same 14-button
--      default set the original seed migration inserted as `created_by is
--      null` rows, now inserted as rows OWNED BY THE CALLING USER
--      (`created_by = auth.uid()`), idempotent (a no-op if that user
--      already has any `header_buttons` row at all).
--   2. Every RLS policy / trigger / RPC that used to branch on
--      "`created_by is null` (shared) OR `created_by = auth.uid()` (own)"
--      drops the null branch — ownership is unconditional now.
--   3. `header_buttons.created_by` becomes `NOT NULL` — "ownerless/shared"
--      is never a valid state any more, so the column should say so.
--   4. `default_hidden` is dropped along with it: that column only ever
--      existed to keep 5 RETIRED `note_entries.button_key` values (Chits,
--      Opportunities, legacy Prayer/Sermons/Worship) technically insertable
--      for the trigger-based validation without cluttering every new
--      user's button row. Nothing writes to `note_entries` under those 5
--      keys any more (confirmed: no client code path does, then or now),
--      and the INSERT-only validation trigger only ever needs to accept
--      values a real header_buttons row exists for — a value nobody ever
--      inserts again needs no accepted-value placeholder at all. Existing
--      historical rows under those keys (if any, in a real deployment)
--      stay exactly as readable as before: `SELECT` was never gated by
--      this trigger, only `INSERT` was.
--   5. `list_header_buttons()` drops `is_system_default` from its return
--      shape — there is no more "system default" for a client to
--      distinguish.
--
-- Mechanism for (1) — provisioning a brand-new user with their own default
-- set — was an explicit judgment call, since this schema has no earlier
-- precedent for per-user provisioning at signup (`activities`/
-- `reflection_cards` are seeded once, globally, a different shape
-- entirely). Deliberately a CLIENT-SIDE bootstrap (`state/
-- useHeaderButtons.ts` calls this RPC once it sees a genuinely empty list —
-- `apiListHeaderButtons` returning `[]`, never `null` — then refetches),
-- NOT a database trigger on `auth.users`, for two reasons: (a) this
-- codebase already has an established client-side "one-time bootstrap
-- gated on a check" shape for exactly this kind of thing —
-- `state/useStepsBackfill.ts` — so this follows existing convention rather
-- than introducing a brand-new pattern (a DB trigger on Supabase's own
-- `auth.users` table) with zero precedent anywhere in this schema; (b) an
-- `auth.users` trigger runs inside the SAME transaction Supabase's own
-- signup flow uses — a bug in it risks breaking sign-up entirely for a
-- config feature that has no business being anywhere near that critical a
-- path. The client-side version fails exactly the way every other
-- local-first control in this app already tolerates a missed sync: the
-- user briefly sees an empty header until the next load retries, never a
-- broken signup.
--
-- Production correction (caught before this ever ran against production):
-- the original Step 1 below deleted the ownerless rows outright. That is
-- safe against an empty test project (zero `auth.users` rows at the time
-- this was written) but NOT against a real deployment — production has
-- real `supplement_completions` rows whose `header_button_id` is a real FK
-- (added in `20260920070000_header_buttons_validation.sql`, no `ON DELETE`
-- clause, so it defaults to RESTRICT) pointing at the ownerless "Supplements"
-- row. Deleting that row outright would abort the whole migration with a
-- foreign-key violation. Step 0 below fixes this the same way
-- `20260921060000_dynamic_note_fields.sql` migrates `sleep_quality`
-- forward: give every real affected user their OWN copy of the full
-- default set first (inline here, not via the RPC below, since a migration
-- script has no `auth.uid()` session to drive it — and a partial copy would
-- wrongly short-circuit that RPC's own idempotency check the first time
-- each user's client calls it), reassign their `supplement_completions`
-- rows onto their own copy, and only then retire the ownerless rows.
-- `note_entries.button_key` / `daily_values.metric_key` need no equivalent
-- reassignment: both are plain validated text columns, not FKs, and the
-- validation trigger they carry only runs on INSERT, never on SELECT — so
-- existing historical rows keep reading exactly as before regardless of
-- what happens to the ownerless header_buttons rows.

-- --- Step 0: provision every real affected user's own button set BEFORE
-- retiring the ownerless rows, and move their supplement_completions off
-- the about-to-be-deleted shared row. -------------------------------------
do $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct user_id from public.note_entries
    union select distinct user_id from public.daily_values
    union select distinct user_id from public.supplement_completions
  loop
    if exists (select 1 from public.header_buttons where created_by = v_user) then
      continue;
    end if;

    insert into public.header_buttons (created_by, category, key, label, sort_order) values
      (v_user, 'notes', 'gifts', 'Extra Senses', 0),
      (v_user, 'notes', 'learnings', 'Learnings', 1),
      (v_user, 'notes', 'mirror', 'Relational Nutrient', 2),
      (v_user, 'notes', 'scriptures', 'Scriptures', 3);

    insert into public.header_button_note_types (header_button_id, value, sort_order)
    select hb.id, v.value, v.ord
    from public.header_buttons hb
    join (values
      ('gifts', 'Dreamer', 0), ('gifts', 'The Voice', 1), ('gifts', 'The Knower', 2),
      ('gifts', 'Memory Bank', 3), ('gifts', 'Amplifier', 4),
      ('learnings', 'Given', 0), ('learnings', 'Realized', 1), ('learnings', 'Revealed', 2)
    ) as v(key, value, ord) on v.key = hb.key
    where hb.created_by = v_user and hb.category = 'notes';

    insert into public.header_buttons (
      created_by, category, label, sort_order, activity_id, entry_mode, quick_log_type, quick_log_type_label, quick_log_sleep_quality
    )
    select v_user, 'activity', v.label, v.sort_order, a.id, v.entry_mode, v.quick_log_type, v.quick_log_type_label, v.quick_log_sleep_quality
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

    insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
    select hb.id, 'primary', 'Note', 0
    from public.header_buttons hb
    join public.activities a on a.id = hb.activity_id
    where hb.created_by = v_user and hb.category = 'activity' and a.name <> 'Vipassana';

    insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
    select hb.id, 'secondary', 'Dreams', 1
    from public.header_buttons hb
    join public.activities a on a.id = hb.activity_id
    where hb.created_by = v_user and hb.category = 'activity' and a.name = 'Sleep';

    insert into public.header_buttons (created_by, category, key, label, sort_order, day_value_unit, day_value_target) values
      (v_user, 'day_value', 'steps', 'Steps', 5, 'int', null),
      (v_user, 'day_value', 'protein', 'Protein', 12, 'target', 80);

    insert into public.header_buttons (created_by, category, label, sort_order) values (v_user, 'checklist', 'Supplements', 13);

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
    where hb.created_by = v_user and hb.category = 'checklist' and hb.label = 'Supplements';

    -- Reassign this user's existing supplement_completions off the
    -- about-to-be-retired ownerless "Supplements" button and onto the copy
    -- just provisioned for them, matching by item_key (both checklists carry
    -- the same 7 fixed items), so their history keeps resolving under a row
    -- they actually own instead of dangling.
    update public.supplement_completions sc
    set header_button_id = (
      select hb.id from public.header_buttons hb
      where hb.created_by = v_user and hb.category = 'checklist' and hb.label = 'Supplements'
    )
    where sc.user_id = v_user
      and sc.header_button_id in (select id from public.header_buttons where created_by is null);
  end loop;
end $$;

-- Fails loudly (not silently) if any row was somehow missed above — the
-- delete below would otherwise abort with a foreign-key violation, exactly
-- the failure this fix exists to prevent.
do $$
begin
  if exists (
    select 1 from public.supplement_completions
    where header_button_id in (select id from public.header_buttons where created_by is null)
  ) then
    raise exception 'supplement_completions still references an ownerless header_buttons row after per-user reassignment';
  end if;
end $$;

-- --- Step 1: retire the ownerless seed rows (cascades to their children). -
delete from public.header_buttons where created_by is null;

-- --- Step 2: provisioning RPC — the same 14-button default set, now always owned. ---
create or replace function public.provision_default_header_buttons()
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

  -- Idempotent: a user who already has any button of their own (from an
  -- earlier provision, or because they've since added/removed their own)
  -- never gets a second copy layered on top.
  if exists (select 1 from public.header_buttons where created_by = v_user) then
    return;
  end if;

  insert into public.header_buttons (created_by, category, key, label, sort_order) values
    (v_user, 'notes', 'gifts', 'Extra Senses', 0),
    (v_user, 'notes', 'learnings', 'Learnings', 1),
    (v_user, 'notes', 'mirror', 'Relational Nutrient', 2),
    (v_user, 'notes', 'scriptures', 'Scriptures', 3);

  insert into public.header_button_note_types (header_button_id, value, sort_order)
  select hb.id, v.value, v.ord
  from public.header_buttons hb
  join (values
    ('gifts', 'Dreamer', 0), ('gifts', 'The Voice', 1), ('gifts', 'The Knower', 2),
    ('gifts', 'Memory Bank', 3), ('gifts', 'Amplifier', 4),
    ('learnings', 'Given', 0), ('learnings', 'Realized', 1), ('learnings', 'Revealed', 2)
  ) as v(key, value, ord) on v.key = hb.key
  where hb.created_by = v_user and hb.category = 'notes';

  insert into public.header_buttons (
    created_by, category, label, sort_order, activity_id, entry_mode, quick_log_type, quick_log_type_label, quick_log_sleep_quality
  )
  select v_user, 'activity', v.label, v.sort_order, a.id, v.entry_mode, v.quick_log_type, v.quick_log_type_label, v.quick_log_sleep_quality
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

  insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
  select hb.id, 'primary', 'Note', 0
  from public.header_buttons hb
  join public.activities a on a.id = hb.activity_id
  where hb.created_by = v_user and hb.category = 'activity' and a.name <> 'Vipassana';

  insert into public.header_button_note_fields (header_button_id, field_key, label, sort_order)
  select hb.id, 'secondary', 'Dreams', 1
  from public.header_buttons hb
  join public.activities a on a.id = hb.activity_id
  where hb.created_by = v_user and hb.category = 'activity' and a.name = 'Sleep';

  insert into public.header_buttons (created_by, category, key, label, sort_order, day_value_unit, day_value_target) values
    (v_user, 'day_value', 'steps', 'Steps', 5, 'int', null),
    (v_user, 'day_value', 'protein', 'Protein', 12, 'target', 80);

  insert into public.header_buttons (created_by, category, label, sort_order) values (v_user, 'checklist', 'Supplements', 13);

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
  where hb.created_by = v_user and hb.category = 'checklist' and hb.label = 'Supplements';
end;
$$;

revoke all on function public.provision_default_header_buttons() from public, anon;
grant execute on function public.provision_default_header_buttons() to authenticated;

-- --- Step 3: header_buttons.created_by becomes NOT NULL. -------------------
alter table public.header_buttons alter column created_by set not null;
alter table public.header_buttons drop column default_hidden;

-- Simplify the key-uniqueness index now that every row has a real owner —
-- the `coalesce(created_by, '00000000-...')` shared-scope trick was only
-- ever needed to give every "system default" a single shared namespace.
drop index public.header_buttons_key_scope_idx;
create unique index header_buttons_key_scope_idx
  on public.header_buttons (created_by, key)
  where key is not null;

-- --- Step 4: RLS — every "created_by is null or created_by = auth.uid()"
-- branch drops the null half; ownership is unconditional now. -------------
drop policy "read system default or own header buttons" on public.header_buttons;
create policy "read own header buttons"
  on public.header_buttons for select
  to authenticated
  using (created_by = (select auth.uid()));

drop policy "read child rows of visible header buttons" on public.header_button_note_fields;
create policy "read own header button note fields"
  on public.header_button_note_fields for select to authenticated
  using (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())));

drop policy "read child rows of visible header buttons" on public.header_button_note_types;
create policy "read own header button note types"
  on public.header_button_note_types for select to authenticated
  using (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())));

drop policy "read child rows of visible header buttons" on public.header_button_checklist_items;
create policy "read own header button checklist items"
  on public.header_button_checklist_items for select to authenticated
  using (exists (select 1 from public.header_buttons hb where hb.id = header_button_id and hb.created_by = (select auth.uid())));

-- --- Step 5: list_header_buttons() — drop `is_system_default`/`default_hidden`, unconditional ownership. ---
-- The return shape changed (a dropped OUT column), so `create or replace`
-- alone can't do it — Postgres requires the old function dropped first.
drop function if exists public.list_header_buttons();

create or replace function public.list_header_buttons()
returns table (
  id uuid,
  category text,
  key text,
  label text,
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
    coalesce(us.sort_order, hb.sort_order)::numeric as sort_order,
    coalesce(us.hidden, false) as hidden,
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
  where hb.created_by = auth.uid()
  order by coalesce(us.hidden, false), coalesce(us.sort_order, hb.sort_order), hb.created_at;
$$;

revoke all on function public.list_header_buttons() from public, anon;
grant execute on function public.list_header_buttons() to authenticated;

-- --- Step 6: set_header_button_hidden / reorder_header_buttons — drop the
-- null-branch (both already worked identically for a "default" vs. "own"
-- row — this just removes now-impossible dead code, not a behavior change). ---
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

  if not exists (select 1 from public.header_buttons where id = p_header_button_id and created_by = auth.uid()) then
    raise exception 'header_button_not_found' using errcode = 'P0002';
  end if;

  insert into public.header_button_user_state (user_id, header_button_id, hidden)
  values (auth.uid(), p_header_button_id, coalesce(p_hidden, false))
  on conflict (user_id, header_button_id) do update set hidden = excluded.hidden;
end;
$$;

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
    if not exists (select 1 from public.header_buttons where id = v_id and created_by = auth.uid()) then
      raise exception 'invalid_header_button_id' using errcode = '22023';
    end if;

    insert into public.header_button_user_state (user_id, header_button_id, sort_order)
    values (auth.uid(), v_id, v_position)
    on conflict (user_id, header_button_id) do update set sort_order = excluded.sort_order;

    v_position := v_position + 1;
  end loop;
end;
$$;

-- --- Step 7: note_entries / daily_values / supplement_completions
-- validation — drop the null-branch everywhere it appears. ----------------
create or replace function public.validate_note_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_button_id uuid;
  v_type_count integer;
begin
  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = new.button_key and created_by = new.user_id
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if new.gift_type is not null then
    if v_type_count = 0 then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = new.gift_type
    ) then
      raise exception 'invalid_gift_type' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_note_entry(
  p_button_key text,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_id uuid;
  v_type_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = p_button_key and created_by = auth.uid()
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if v_type_count > 0 then
    if p_gift_type is null or not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = p_gift_type
    ) then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  insert into public.note_entries (user_id, button_key, note_encrypted, gift_type)
  values (
    auth.uid(), p_button_key, internal.encrypt_note_entry_text(p_note),
    case when v_type_count > 0 then p_gift_type else null end
  )
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

create or replace function public.update_note_entry(
  p_id uuid,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_key text;
  v_button_id uuid;
  v_type_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  select button_key into v_button_key
  from public.note_entries
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if v_button_key is null then
    raise exception 'note_entry_not_found' using errcode = 'P0002';
  end if;

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = v_button_key and created_by = auth.uid()
  limit 1;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if v_type_count > 0 then
    if p_gift_type is null or not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = p_gift_type
    ) then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  update public.note_entries
  set note_encrypted = internal.encrypt_note_entry_text(p_note),
      gift_type = case when v_type_count > 0 then p_gift_type else null end
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

create or replace function public.validate_daily_value_metric_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.header_buttons
    where category = 'day_value' and key = new.metric_key and created_by = new.user_id
  ) then
    raise exception 'invalid_metric_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.set_daily_value(
  p_metric_key text,
  p_local_date date,
  p_value integer
) returns public.daily_value_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.daily_values;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.header_buttons
    where category = 'day_value' and key = p_metric_key and created_by = auth.uid()
  ) then
    raise exception 'invalid_metric_key' using errcode = '22023';
  end if;

  if p_value is null or p_value < 0 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  insert into public.daily_values (user_id, metric_key, local_date, value)
  values (auth.uid(), p_metric_key, p_local_date, p_value)
  on conflict (user_id, metric_key, local_date) do update set value = excluded.value
  where public.daily_values.user_id = auth.uid()
  returning * into v_row;

  return public.to_daily_value_dto(v_row);
end;
$$;

create or replace function public.validate_supplement_completion_item_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.header_button_checklist_items ci
    join public.header_buttons hb on hb.id = ci.header_button_id
    where ci.header_button_id = new.header_button_id
      and ci.item_key = new.item_key
      and hb.created_by = new.user_id
  ) then
    raise exception 'invalid_item_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.set_supplement_completion(
  p_header_button_id uuid,
  p_item_key text,
  p_local_date date,
  p_done boolean,
  p_note text default null
) returns public.supplement_completion_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.supplement_completions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.header_button_checklist_items ci
    join public.header_buttons hb on hb.id = ci.header_button_id
    where ci.header_button_id = p_header_button_id and ci.item_key = p_item_key and hb.created_by = auth.uid()
  ) then
    raise exception 'invalid_item_key' using errcode = '22023';
  end if;

  insert into public.supplement_completions (user_id, header_button_id, item_key, local_date, done, note_encrypted, completed_at)
  values (
    auth.uid(), p_header_button_id, p_item_key, p_local_date, coalesce(p_done, false),
    internal.encrypt_supplement_note(p_note),
    case when coalesce(p_done, false) then now() else null end
  )
  on conflict (user_id, header_button_id, item_key, local_date) do update set
    done = excluded.done,
    note_encrypted = excluded.note_encrypted,
    completed_at = case when excluded.done then coalesce(public.supplement_completions.completed_at, now()) else null end
  where public.supplement_completions.user_id = auth.uid()
  returning * into v_row;

  return public.to_supplement_completion_dto(v_row);
end;
$$;
