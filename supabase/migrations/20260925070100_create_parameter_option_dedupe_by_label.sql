-- Found in code review on `20260925070000_parameter_options_global_vocabulary.sql`:
-- `create_parameter_option`'s `on conflict (id) do nothing` only ever covers
-- an id collision (the client-supplied-id retry case every other `create_*`
-- RPC in this schema already handles this way) — it does NOT cover
-- `parameter_options_scope_idx`, the (created_by, parameter_type, label)
-- uniqueness this table ALSO enforces. Re-adding a label the user already
-- has for that type (e.g. typing "Flow" again into "Your options") reached
-- an INSERT that raised a raw, uncaught 23505 unique-violation — the client
-- only sees a generic RPC failure and shows "Saved on this device — will
-- sync once you're back online," which is actively wrong here: this add can
-- never sync, since every retry hits the exact same violation.
--
-- Fix: check for an existing (created_by, parameter_type, label) row FIRST
-- and return ITS id if found — the exact same "adding an already-present
-- value is a harmless no-op that returns the existing identity" contract
-- `set_parameter_options_override` (the old model) and this migration's own
-- sibling functions already established elsewhere in this schema, just
-- applied here too. A second check after a failed insert covers the
-- genuinely rare race (two concurrent adds of the very same new label).
--
-- The matching CLIENT-side fix (skip the optimistic add entirely when the
-- label's already shown, rather than relying solely on this) is in
-- `app/src/state/useParameterVocabulary.ts`'s own `addOption`.
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

  insert into public.parameter_options (id, created_by, parameter_type, label, icon_key, sort_order)
  values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_parameter_type, v_trimmed_label,
    nullif(btrim(coalesce(p_icon_key, '')), ''), v_sort_order
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    if p_id is not null then
      select id into v_id from public.parameter_options where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    -- The rare concurrent-duplicate-label race: someone else's insert of
    -- this exact label committed between the check above and this one.
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
-- Sanity check.
-- ===========================================================================
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_first_id uuid;
  v_second_id uuid;
  v_count integer;
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);

  v_first_id := public.create_parameter_option('quality', 'Focused');
  v_second_id := public.create_parameter_option('quality', 'Focused');
  if v_first_id <> v_second_id then
    raise exception 'dedupe check: expected the same id back for a duplicate label, got % and %', v_first_id, v_second_id;
  end if;

  select count(*) into v_count from public.parameter_options
  where created_by = v_probe and parameter_type = 'quality' and label = 'Focused';
  if v_count <> 1 then
    raise exception 'dedupe check: expected exactly one stored row for the duplicate label, got %', v_count;
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = v_probe;
  raise notice 'create_parameter_option_dedupe_by_label: ALL CHECKS PASSED';
end $$;
