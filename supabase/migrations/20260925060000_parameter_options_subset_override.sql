-- PICKER-CUSTOM-1 follow-up (real user feedback, post-merge): today the
-- only way to narrow a given activity's quality/symptom/protective-response
-- list is `create_parameter_option`, which only ever ADDS a row — and per
-- the inheritance rule, the FIRST own row for an (activity, type) already
-- drops the whole inherited list in favor of just that one new row. A user
-- who wants "5 of these 18 quality options, not all 18" had no way to reach
-- that state without retyping every option they wanted to KEEP from
-- scratch, one `create_parameter_option` call at a time.
--
-- Fix: one new RPC, `set_parameter_options_override`, that materializes an
-- activity's (or the fallback's, `p_activity_id is null`) own list to be
-- EXACTLY the given label set, in one atomic step — an upsert-by-label
-- (existing own rows for a label that's still wanted keep their identity;
-- newly-wanted labels get a fresh row; own rows for a label that's no
-- longer wanted are removed) rather than N sequential inserts. The client
-- calls this with "the current effective list, plus or minus one label" for
-- both adding AND removing now — see `state/useParameterOptions.ts`'s
-- `setOverride`.
--
-- History-safety: reuses `internal.parameter_option_in_use` — the exact
-- same check `delete_parameter_option` already runs — rather than
-- reimplementing it. A label being dropped that already has real logged
-- history on this activity is kept anyway (never silently destroyed, rule
-- 11's spirit applied to config), and its label is returned via
-- `skipped_label` so the UI can tell the user their requested removal was
-- only partially honored — the exact same `skipped_label` contract
-- `reset_parameter_options_to_inherited` already established.
--
-- Known, documented limitation (inherent to the inheritance model, not
-- fixed here): setting the override to an EMPTY label list removes every
-- own row, which per `internal.effective_parameter_options`'s own fallback
-- rule means the activity reverts to showing its INHERITED list again, not
-- a deliberately empty one — "own list of zero" and "no override at all"
-- are the same state. Representing a genuinely empty list would need a
-- sentinel row or a separate boolean column; out of scope for this pass,
-- which only asked for real subset narrowing (e.g. 5 of 18), never zero.
--
-- SECURITY DEFINER, same reasoning `delete_parameter_option` already
-- established: `activity_parameter_options` has no DELETE RLS policy at
-- all (real deletes only ever happen through a function that re-checks
-- ownership itself) — without this, the DELETE below would silently
-- affect zero rows under RLS (found exactly this way: a first draft without
-- `security definer` passed every check that didn't involve dropping a
-- label, and silently failed to drop anything). Every operation inside is
-- still explicitly scoped to `created_by = auth.uid()` (via the loop's own
-- `select`, or the insert's own `values`), so bypassing RLS here never
-- reaches another user's rows.
create or replace function public.set_parameter_options_override(
  p_activity_id uuid,
  p_parameter_type text,
  p_labels text[]
) returns table (skipped_label text)
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_wanted text[] := coalesce(p_labels, '{}');
  v_existing record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_parameter_type not in ('quality', 'symptom', 'flag') then
    raise exception 'invalid_parameter_type' using errcode = '22023';
  end if;
  if p_activity_id is not null and not exists (
    select 1 from public.activities where id = p_activity_id and created_by = auth.uid()
  ) then
    raise exception 'invalid_activity' using errcode = '22023';
  end if;

  -- Drop every existing OWN row for this (activity, type) that is no longer
  -- wanted — unless it's already been used in real history, in which case
  -- it's kept (and reported back) rather than silently destroyed.
  for v_existing in
    select id, label from public.activity_parameter_options
    where created_by = auth.uid()
      and activity_id is not distinct from p_activity_id
      and parameter_type = p_parameter_type
      and not (label = any (v_wanted))
  loop
    if internal.parameter_option_in_use(p_parameter_type, v_existing.label) then
      skipped_label := v_existing.label;
      return next;
    else
      delete from public.activity_parameter_options where id = v_existing.id;
    end if;
  end loop;

  -- Upsert every wanted label, in the given order — an existing row (label
  -- already owned) keeps its own `id` (and therefore any history keyed to
  -- it stays meaningful), only its `sort_order` may change; a genuinely new
  -- label gets a fresh row. The unique index this relies on already exists
  -- (`activity_parameter_options_scope_idx`, from the original
  -- PICKER-CUSTOM-1 migration) — same "every NULL activity_id is one shared
  -- per-user scope" coalesce trick that index already uses.
  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select auth.uid(), p_activity_id, p_parameter_type, v.label, v.ord - 1
  from unnest(v_wanted) with ordinality as v (label, ord)
  where btrim(v.label) <> ''
  on conflict (created_by, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid), parameter_type, label)
  do update set sort_order = excluded.sort_order;
end;
$$;

revoke all on function public.set_parameter_options_override(uuid, text, text[]) from public, anon;
grant execute on function public.set_parameter_options_override(uuid, text, text[]) to authenticated;

-- ===========================================================================
-- Sanity check — mirrors this codebase's own throwaway-probe-user
-- convention.
-- ===========================================================================
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_activity_id uuid;
  v_sa_id uuid := gen_random_uuid();
  v_count integer;
  v_skipped text[];
  v_pitta_id uuid;
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.provision_default_tiles();
  perform public.provision_default_activities();
  perform public.provision_default_parameter_options();

  select id into v_activity_id from public.activities where created_by = v_probe and parent_id is null limit 1;

  -- Materialize a 3-of-18 subset in one call.
  perform public.set_parameter_options_override(
    v_activity_id, 'quality', array['Resonance', 'Flow', 'Engaged']
  );
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 3 then
    raise exception 'subset check: expected exactly 3 quality options after override, got %', v_count;
  end if;

  -- Narrowing further (remove 'Flow') keeps the other two, doesn't require
  -- retyping them.
  perform public.set_parameter_options_override(v_activity_id, 'quality', array['Resonance', 'Engaged']);
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 2 then
    raise exception 'subset check: expected 2 quality options after narrowing, got %', v_count;
  end if;

  -- Log real history against 'Resonance', then try to drop it — must be
  -- kept (same rule delete_parameter_option already enforces) and reported
  -- via skipped_label.
  perform public.create_scheduled_activity(
    p_activity_id := v_activity_id,
    p_path := '{}'::text[],
    p_start_at := now(),
    p_duration_minutes := 30,
    p_local_date := current_date,
    p_start_minute := 600::smallint,
    p_timezone := 'UTC',
    p_quality := array['Resonance'],
    p_id := v_sa_id
  );

  select array_agg(skipped_label) into v_skipped
  from public.set_parameter_options_override(v_activity_id, 'quality', array['Engaged']);
  if v_skipped is null or not ('Resonance' = any(v_skipped)) then
    raise exception 'history-safety check: expected "Resonance" to be reported as skipped (in use), got %', v_skipped;
  end if;

  select count(*) into v_count from public.activity_parameter_options
  where created_by = v_probe and activity_id = v_activity_id and parameter_type = 'quality';
  if v_count <> 2 then
    raise exception 'history-safety check: expected Resonance kept alongside Engaged (2 rows), got %', v_count;
  end if;

  -- The fallback scope (p_activity_id null) works the same way.
  perform public.set_parameter_options_override(null, 'symptom', array['Pitta', 'Dryness']);
  select count(*) into v_count from public.list_effective_parameter_options(null, 'symptom');
  if v_count <> 2 then
    raise exception 'fallback-scope check: expected 2 symptom options, got %', v_count;
  end if;

  -- A relabeled-but-same-set call is a no-op on row identity (upsert, not
  -- delete+reinsert) — verified by an id staying stable across two calls
  -- with the same label.
  select id into v_pitta_id from public.activity_parameter_options
  where created_by = v_probe and activity_id is null and parameter_type = 'symptom' and label = 'Pitta';
  perform public.set_parameter_options_override(null, 'symptom', array['Pitta', 'Dryness']);
  if not exists (
    select 1 from public.activity_parameter_options
    where id = v_pitta_id and created_by = v_probe and label = 'Pitta'
  ) then
    raise exception 'upsert-identity check: expected the same row id to survive a repeat call with the same labels';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.tiles where created_by = v_probe;
  delete from auth.users where id = v_probe;
  raise notice 'set_parameter_options_override: ALL CHECKS PASSED';
end $$;
