-- Follow-up to
-- `20260925060400_normalize_set_parameter_options_override_wanted.sql`
-- (found in self-review, same development session): `v_wanted` was
-- normalized (trimmed, NULLs and blanks removed) but never deduplicated. A
-- `p_labels` array containing the SAME label twice (e.g. `['Flow', 'Flow']`)
-- reaches the INSERT ... ON CONFLICT DO UPDATE below unchanged, and Postgres
-- raises "ON CONFLICT DO UPDATE command cannot affect row a second time"
-- when one statement's own VALUES/SELECT would touch the same conflict
-- target twice — the whole call fails outright. Today's real caller
-- (`apiSetParameterOptionsOverride`, fed a plain string list assembled from
-- already-unique chip labels) never sends a duplicate, so this was latent —
-- but this RPC is `security definer` and directly callable via
-- `supabase.rpc(...)` by any authenticated user (the same threat model the
-- three earlier follow-ups in this pass already reasoned about), so it must
-- not hard-fail on a caller sending the same label twice.
--
-- Fix: deduplicate `v_wanted` by its trimmed value, keeping each label's
-- FIRST occurrence (and that occurrence's position, so `sort_order` still
-- reflects "the order the caller listed things in," just collapsing an
-- accidental repeat rather than erroring on it) — `distinct on (label)
-- order by label, first_ord` picks the earliest `ord` per distinct label,
-- then the outer `array_agg(... order by first_ord)` restores that original
-- relative order.
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
    select coalesce(array_agg(v.label order by v.first_ord), '{}')
    from (
      select distinct on (btrim(x)) btrim(x) as label, ord as first_ord
      from unnest(array_remove(coalesce(p_labels, '{}'), null)) with ordinality as t (x, ord)
      where btrim(x) <> ''
      order by btrim(x), ord
    ) v
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
