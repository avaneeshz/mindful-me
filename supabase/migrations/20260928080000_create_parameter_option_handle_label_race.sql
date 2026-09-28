-- Deferred finding from PR #41's own code review, fixed now: a genuine
-- cross-device/cross-tab race on the exact same NEW label —
-- `create_parameter_option`'s existing "check for an existing (created_by,
-- parameter_type, label) row first" (`20260925070100_
-- create_parameter_option_dedupe_by_label.sql`) closes the common case, but
-- its own fallback after a failed insert (`if v_id is null then ... select
-- id into v_id from parameter_options where ... label = v_trimmed_label`)
-- was DEAD CODE for this exact race: `insert ... on conflict (id) do
-- nothing` only suppresses a conflict on the `id` primary key — it does
-- nothing for a violation of `parameter_options_scope_idx` (created_by,
-- parameter_type, label), the OTHER unique constraint this table enforces
-- and the one that actually fires when two callers insert the same new
-- label at once. Postgres requires an `ON CONFLICT` target to match the
-- constraint that's violated; a target mismatch means the INSERT just
-- raises a raw, uncaught `unique_violation` instead of returning a null
-- `v_id` the function could recover from.
--
-- Client-side, that uncaught exception surfaces as a plain RPC failure —
-- `apiCreateParameterOption` returns `null`, and `useParameterVocabulary`'s
-- `addOption` treats a `null` serverId as "saved locally, will sync" and
-- keeps the LOCAL optimistic id — except this add never actually landed on
-- the server (the insert raised, it never committed), so that id is a
-- phantom nothing on the server has. Any later action on it (e.g. selecting
-- it for an activity, or removing it) then fails as "not found," with no
-- way to ever succeed, exactly the failure mode `addOption`'s own doc
-- comment on RECONCILING to a server-returned id already anticipates for
-- the case where the server DOES resolve the race cleanly — it just never
-- got the chance to here.
--
-- Fix: catch `unique_violation` around the insert itself (nested
-- begin/exception, plpgsql's normal way to recover from a specific error
-- code) and fall through to the same re-select-by-label logic already
-- written for this case, instead of letting the exception propagate.
create or replace function public.create_parameter_option(
  p_parameter_type text,
  p_label text,
  p_icon_key text default null,
  p_id uuid default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_trimmed_label text;
  v_sort_order integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_parameter_type not in ('quality', 'symptom', 'flag') then
    raise exception 'invalid_parameter_type' using errcode = '22023';
  end if;
  v_trimmed_label := btrim(coalesce(p_label, ''));
  if v_trimmed_label = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  select id into v_id
  from public.parameter_options
  where created_by = auth.uid() and parameter_type = p_parameter_type and label = v_trimmed_label;
  if v_id is not null then
    return v_id;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.parameter_options
  where created_by = auth.uid() and parameter_type = p_parameter_type;

  begin
    insert into public.parameter_options (id, created_by, parameter_type, label, icon_key, sort_order)
    values (
      coalesce(p_id, gen_random_uuid()), auth.uid(), p_parameter_type, v_trimmed_label,
      nullif(btrim(coalesce(p_icon_key, '')), ''), v_sort_order
    )
    on conflict (id) do nothing
    returning id into v_id;
  exception when unique_violation then
    -- Lost the race on `parameter_options_scope_idx` against a concurrent
    -- insert of this exact same label from another device/tab — not an id
    -- collision (`on conflict (id)` already covers that above). Not a real
    -- failure: fall through to the existing recovery logic below instead of
    -- raising.
    v_id := null;
  end;

  if v_id is null then
    if p_id is not null then
      select id into v_id from public.parameter_options where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    -- The winner of the race committed this exact label under a different
    -- id — pick it up here.
    select id into v_id
    from public.parameter_options
    where created_by = auth.uid() and parameter_type = p_parameter_type and label = v_trimmed_label;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_parameter_option_failed' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_parameter_option(text, text, text, uuid) from public, anon;
grant execute on function public.create_parameter_option(text, text, text, uuid) to authenticated;

-- ===========================================================================
-- Sanity check. A single serial self-test block can't drive two genuinely
-- concurrent transactions, so it can't reproduce the race end-to-end —
-- instead it (a) re-confirms the ordinary duplicate-label path still works,
-- and (b) directly proves the assumption this fix depends on: that a
-- `parameter_options_scope_idx` violation really does raise a plain
-- `unique_violation` or this exact index, which is exactly what the
-- function's new nested exception block above catches.
-- ===========================================================================
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_other_id uuid := gen_random_uuid();
  v_result uuid;
  v_first_id uuid;
  v_caught boolean := false;
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);

  v_first_id := public.create_parameter_option('quality', 'Grounded');
  v_result := public.create_parameter_option('quality', 'Grounded');
  if v_result <> v_first_id then
    raise exception 'dedupe check: expected the same id back for a duplicate label, got % and %', v_first_id, v_result;
  end if;

  begin
    insert into public.parameter_options (id, created_by, parameter_type, label, sort_order)
    values (v_other_id, v_probe, 'quality', 'Grounded', 0);
  exception when unique_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'race check: expected a unique_violation on parameter_options_scope_idx, got none';
  end if;

  v_result := public.create_parameter_option('quality', 'Grounded');
  if v_result <> v_first_id then
    raise exception 'post-race check: expected create_parameter_option to still resolve to the original id, got %', v_result;
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = v_probe;
  raise notice 'create_parameter_option_handle_label_race: ALL CHECKS PASSED';
end $$;
