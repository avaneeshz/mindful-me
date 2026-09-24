-- Historical note (kept accurate after a self-review pass — see the PR):
-- this migration was written and applied to the test project to fix a real
-- bug caught live by this branch's own sanity-check do-block
-- (`20260924063000_parameter_options_validation.sql`) — the FIRST draft of
-- `provision_default_activities()` in `20260924061000_activities_
-- customization.sql` copied `tile_id` but not `category_id` for new
-- top-level rows, violating the pre-existing `top_level_has_category` check
-- constraint (`parent_id is not null or category_id is not null`).
--
-- That earlier migration's own FILE was then also corrected in place in the
-- same development session (before either one had shipped past this
-- branch), so as committed here, `20260924061000_...`'s
-- `provision_default_activities()` already includes the `category_id` fix
-- too — making the `create or replace function` below a byte-for-byte
-- idempotent no-op against that file's current content, not a second real
-- fix. It is kept, rather than deleted, only because it was already applied
-- to the test project as its own migration step (`supabase_migrations.
-- schema_migrations` already records it) — removing the file here would
-- leave the repo and the live test project's applied-migration history out
-- of sync for no functional benefit; `CREATE OR REPLACE FUNCTION` is
-- idempotent, so re-running it changes nothing.
--
-- `category_id` itself is deprecated but not yet dropped (contract-later,
-- see the previous migration's own TODO) — it must still be populated for a
-- NEW top-level row to satisfy that constraint until a later contract
-- migration relaxes or drops it; `tile_id` is the column every current and
-- future read path actually uses.
create or replace function public.provision_default_activities()
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

  if exists (select 1 from public.activities where created_by = v_user) then
    return;
  end if;

  perform public.provision_default_tiles();

  create temporary table _activity_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  loop
    insert into _activity_id_map (old_id, new_id)
    select a.id, gen_random_uuid()
    from public.activities a
    where a.created_by is null
      and not exists (select 1 from _activity_id_map m where m.old_id = a.id)
      and (a.parent_id is null or exists (select 1 from _activity_id_map m where m.old_id = a.parent_id));

    exit when not found;
  end loop;

  insert into public.activities (id, name, category_id, tile_id, parent_id, icon_key, entry_mode, created_by, sort_order)
  select
    m.new_id,
    a.name,
    a.category_id,
    case when a.parent_id is null then t.id else null end,
    pm.new_id,
    a.icon_key,
    a.entry_mode,
    v_user,
    (row_number() over (partition by coalesce(a.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) order by a.created_at) - 1)
  from public.activities a
  join _activity_id_map m on m.old_id = a.id
  left join _activity_id_map pm on pm.old_id = a.parent_id
  left join public.tiles t on a.parent_id is null and t.created_by = v_user and t.label = case a.category_id
    when 'sleep' then 'Sleep & Rest'
    when 'food' then 'Food & Nourishment'
    when 'care' then 'Personal Care'
    when 'downtime' then 'Downtime & Errands'
    when 'movement' then 'Movement & Body Therapy'
    when 'work' then 'Work & Projects'
    when 'nature' then 'Nature & Spirit'
    when 'growth' then 'Growth & Connection'
    when 'home' then 'Home & Chores'
    else null
  end
  where a.created_by is null;
end;
$$;
