-- Follow-up to `20260925060300_null_safe_set_parameter_options_override.sql`
-- (found in self-review, same development session): the delete-candidate
-- loop's "is this label still wanted" check compared against the RAW
-- `v_wanted` array, while the INSERT below it stored `btrim(v.label)` — the
-- two used different normalizations of the same input. A label sent with
-- surrounding whitespace (e.g. `' Flow'`) would not match an existing,
-- already-trimmed `'Flow'` row in the "still wanted" comparison, so that row
-- would be deleted as no-longer-wanted, then a BRAND NEW row inserted for
-- the trimmed `'Flow'` — breaking the row-identity-preservation guarantee
-- this function's own sanity check explicitly asserts ("upsert-identity
-- check: expected the same row id to survive a repeat call"). Today's real
-- caller (`apiSetParameterOptionsOverride`) always trims client-side, so
-- this was latent, not observed — but this RPC is `security definer` and
-- directly callable via `supabase.rpc(...)` by any authenticated user (the
-- same threat model the previous two follow-ups in this pass already
-- reasoned about), so it must behave correctly on its own, without relying
-- on a well-behaved caller.
--
-- Fix: normalize `v_wanted` ONCE, up front (trim every element, same as the
-- NULL-removal already done in the previous follow-up), so every later use
-- of `v_wanted` — the delete-loop's comparison AND the insert — operates on
-- the exact same, already-trimmed values. The insert's own `btrim(v.label)`
-- becomes a no-op belt-and-braces call at that point, not load-bearing on
-- its own; left in place rather than removed, since it costs nothing and
-- guards against `v_wanted`'s own normalization ever changing later without
-- this comment being re-read.
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
  v_wanted text[] := (
    select coalesce(array_agg(btrim(v)), '{}')
    from unnest(array_remove(coalesce(p_labels, '{}'), null)) as v
    where btrim(v) <> ''
  );
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

  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select auth.uid(), p_activity_id, p_parameter_type, btrim(v.label), v.ord - 1
  from unnest(v_wanted) with ordinality as v (label, ord)
  where btrim(v.label) <> ''
  on conflict (created_by, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid), parameter_type, label)
  do update set sort_order = excluded.sort_order;
end;
$$;

revoke all on function public.set_parameter_options_override(uuid, text, text[]) from public, anon;
grant execute on function public.set_parameter_options_override(uuid, text, text[]) to authenticated;
