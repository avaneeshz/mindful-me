-- Follow-up to `20260925060000_parameter_options_subset_override.sql`
-- (found in self-review, same development session): that function's INSERT
-- filtered on `btrim(v.label) <> ''` but then inserted the UNTRIMMED
-- `v.label` — unlike the sibling `create_parameter_option` RPC, which stores
-- `btrim(p_label)`. Today's only caller (`apiSetParameterOptionsOverride`)
-- already trims client-side, so this was latent, not exercised — but any
-- other/future caller that sends `'Flow '` alongside an existing `'Flow'`
-- would get two visually-identical chips stored as distinct rows, since the
-- uniqueness index on `(created_by, activity_id, parameter_type, label)`
-- compares raw label text and does not normalize whitespace the way the
-- WHERE clause's `btrim()` only validated non-blankness, not trimming.
--
-- Fix: insert `btrim(v.label)`, matching `create_parameter_option`'s own
-- behavior exactly. No data backfill — no row has ever been inserted with a
-- non-trimmed label in practice (the one real caller always trims first),
-- so there is nothing to correct, only the function body going forward.
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
