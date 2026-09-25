-- Follow-up to `20260925060000_parameter_options_subset_override.sql`,
-- applied in the same development session (mirrors
-- `20260924061500_fix_provision_default_activities_category_id.sql`'s own
-- precedent for exactly this situation): the FIRST attempt to apply that
-- migration's `set_parameter_options_override` bundled its own sanity-check
-- do-block in the same statement batch, and that batch's LAST statement
-- (the do-block's own cleanup step) failed on an unrelated ordering bug —
-- which rolled back the whole batch, including the `security definer`
-- fix that had just been added to the function after catching a real bug
-- (its internal `DELETE` was silently a no-op under RLS — this table has no
-- DELETE policy at all, by design; see that migration's own doc comment).
-- This file re-applies just the corrected function definition on its own,
-- so the fix survives independently of the sanity-check batch's own
-- unrelated cleanup-ordering mistake. As committed here,
-- `20260925060000_...`'s own file already includes the `security definer`
-- fix directly — this is a no-op `CREATE OR REPLACE` against that file's
-- current content, kept only to stay in sync with what the test project's
-- migration history already records.
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
  select auth.uid(), p_activity_id, p_parameter_type, v.label, v.ord - 1
  from unnest(v_wanted) with ordinality as v (label, ord)
  where btrim(v.label) <> ''
  on conflict (created_by, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid), parameter_type, label)
  do update set sort_order = excluded.sort_order;
end;
$$;

revoke all on function public.set_parameter_options_override(uuid, text, text[]) from public, anon;
grant execute on function public.set_parameter_options_override(uuid, text, text[]) to authenticated;
