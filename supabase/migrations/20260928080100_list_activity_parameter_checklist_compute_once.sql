-- Deferred finding from PR #41's own code review, fixed now:
-- `list_activity_parameter_checklist` called
-- `internal.effective_parameter_option_ids` — itself a recursive CTE walking
-- the activity's own ancestor chain plus a join against
-- `activity_parameter_selections` — inside a per-ROW correlated `exists (...)`
-- subquery, once for every option in the user's global vocabulary. Same
-- shape for `is_own`, its own per-row correlated `exists (...)` even though
-- its value never varies by option (see this function's original doc
-- comment: "same on every returned row"). For an activity with a deep
-- ancestor chain and a large vocabulary, this reruns the same
-- activity-chain walk and the same "does this activity own anything" check
-- once per row instead of once per call.
--
-- Fix: compute both ONCE, via `materialized` CTEs (explicit, rather than
-- relying on the planner's default un-materialized CTE inlining, since
-- neither depends on anything from the outer `parameter_options` row and
-- both need computing exactly once regardless of plan shape) — then probe
-- membership/reuse the flag per row against that fixed result instead of
-- re-deriving it every time.
create or replace function public.list_activity_parameter_checklist(p_activity_id uuid, p_type text)
returns table (option_id uuid, label text, icon_key text, sort_order integer, selected boolean, is_own boolean)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  with effective_ids as materialized (
    select ids.option_id from internal.effective_parameter_option_ids(p_activity_id, p_type) ids
  ),
  own_flag as materialized (
    select exists (
      select 1
      from public.activity_parameter_selections aps
      join public.parameter_options po2 on po2.id = aps.option_id
      where aps.activity_id = p_activity_id and aps.created_by = auth.uid() and po2.parameter_type = p_type
    ) as is_own
  )
  select
    po.id,
    po.label,
    po.icon_key,
    po.sort_order,
    exists (select 1 from effective_ids e where e.option_id = po.id),
    (select is_own from own_flag)
  from public.parameter_options po
  where po.created_by = auth.uid() and po.parameter_type = p_type
  order by po.sort_order;
$$;

revoke all on function public.list_activity_parameter_checklist(uuid, text) from public, anon;
grant execute on function public.list_activity_parameter_checklist(uuid, text) to authenticated;

-- ===========================================================================
-- Sanity check — same behavior as before this rewrite, just proving it: a
-- purely-inheriting activity shows every global option selected with
-- `is_own = false`; after one explicit toggle, only that option's row
-- reflects the change and every row's `is_own` flips to `true`.
-- ===========================================================================
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_tile_id uuid;
  v_activity_id uuid;
  v_second_option_id uuid;
  v_selected_count integer;
  v_own_count integer;
  v_row_count integer;
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.create_parameter_option('quality', 'Steady');
  perform public.create_parameter_option('quality', 'Restless');
  select id into v_second_option_id from public.parameter_options where created_by = v_probe and label = 'Restless';

  v_tile_id := public.create_tile('Checklist probe tile', 'sparkles');
  v_activity_id := public.create_activity('Checklist probe activity', v_tile_id);

  select count(*), count(*) filter (where selected), count(*) filter (where is_own)
  into v_row_count, v_selected_count, v_own_count
  from public.list_activity_parameter_checklist(v_activity_id, 'quality');
  if v_row_count <> v_selected_count or v_own_count <> 0 then
    raise exception 'inheriting check: expected every row selected and is_own=false, got % of % selected, % own', v_selected_count, v_row_count, v_own_count;
  end if;

  -- Deselecting one previously-inherited option (rather than re-selecting
  -- an already-selected one, which would be a no-op change) is what
  -- actually exercises the materialize-then-apply path in a way this test
  -- can observe: 'Restless' starts selected (purely inheriting), so
  -- unchecking it is the one toggle that visibly narrows the selected set.
  perform public.set_activity_parameter_selection(v_activity_id, 'quality', v_second_option_id, false);

  select count(*), count(*) filter (where selected), count(*) filter (where is_own)
  into v_row_count, v_selected_count, v_own_count
  from public.list_activity_parameter_checklist(v_activity_id, 'quality');
  if v_own_count <> v_row_count then
    raise exception 'materialized-own check: expected every row is_own=true after one toggle, got % of %', v_own_count, v_row_count;
  end if;
  if v_selected_count <> 1 then
    raise exception 'materialized-own check: expected exactly one selected row, got %', v_selected_count;
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = v_probe;
  raise notice 'list_activity_parameter_checklist_compute_once: ALL CHECKS PASSED';
end $$;
