-- Follow-up to `20260925060000_parameter_options_subset_override.sql`
-- (found in self-review, same development session): `v_wanted` was used
-- directly from `coalesce(p_labels, '{}')` with no per-element NULL guard.
-- Postgres's `x = ANY(array_with_a_null_element)` uses three-valued logic —
-- for a row whose label matches none of the non-null wanted labels, the
-- whole `label = any(v_wanted)` comparison evaluates to NULL (not false)
-- once `v_wanted` contains a NULL, so `not (label = any(v_wanted))` is also
-- NULL, which a `WHERE` clause treats as "don't select this row." A `p_labels`
-- array containing even one NULL element would therefore silently exclude
-- every non-matching row from the deletion loop — nothing gets removed, and
-- nothing is reported as skipped either, so the caller gets no signal that
-- their requested removals were ignored.
--
-- Today's only real caller (`apiSetParameterOptionsOverride`, via
-- `state/useParameterOptions.ts`'s `setOverride`) can never actually produce
-- a NULL element (labels are typed `string[]`, always trimmed and filtered
-- for blanks client-side) — this is defense at the RPC boundary, not a fix
-- for an observed client bug: `set_parameter_options_override` is `security
-- definer` and directly callable via `supabase.rpc(...)` by any authenticated
-- user, so it must not silently misbehave on malformed input from a caller
-- this codebase doesn't control (a future client, a different platform, or a
-- hand-crafted request).
--
-- Fix: strip NULL elements from `v_wanted` up front with `array_remove`,
-- the same one-line pattern used to strip blanks elsewhere in this function
-- (`where btrim(v.label) <> ''`) — once `v_wanted` is guaranteed NULL-free,
-- `label = any(v_wanted)` is always a real boolean, never NULL.
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
  v_wanted text[] := array_remove(coalesce(p_labels, '{}'), null);
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
