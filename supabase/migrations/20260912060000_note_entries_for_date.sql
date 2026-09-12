-- "Download this day's data" (day-export feature) needs every note entry
-- logged on ONE calendar day, across all buttons at once. The only existing
-- read path, `list_note_entries(p_button_key)`, returns one button's entire
-- all-time history -- fetching every button's full history and filtering
-- client-side to find one day's rows would mean loading a user's full
-- note-entry history to render one day, which is exactly what rule 8
-- ("every read of 'today' or 'this week' is scoped to that window") forbids.
-- This adds a real date-scoped RPC instead, mirroring
-- `list_scheduled_activities(p_range_start, p_range_end)`
-- (20260826063500_scheduling_api.sql): a real-instant half-open range,
-- computed client-side from the viewed calendar day (`lib/localTime.ts`'s
-- `localDayRange`), not a `date` column comparison -- `note_entries.created_at`
-- is a `timestamptz`, and the day boundary is the device's own local
-- midnight, so the range has to be resolved to real instants by the caller.
--
-- SECURITY INVOKER (the default, like `list_note_entries`) -- RLS's existing
-- "read own note entries" policy is the real enforcement boundary; the
-- explicit `n.user_id = auth.uid()` filter below is belt-and-braces on top
-- of it, same as every other list RPC in this project.
--
-- Purely additive: no existing table, column, policy or function is touched.

create or replace function public.list_note_entries_for_date(
  p_range_start timestamptz,
  p_range_end timestamptz
) returns setof public.note_entry_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_note_entry_dto(n)
  from public.note_entries n
  where n.user_id = auth.uid()
    and n.created_at >= p_range_start
    and n.created_at < p_range_end
  order by n.created_at desc;
$$;

-- Locked down from the start (authenticated only) -- same convention every
-- RPC in this project follows (see 20260826063600_lock_down_function_grants.sql).
revoke all on function public.list_note_entries_for_date(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.list_note_entries_for_date(timestamptz, timestamptz) to authenticated;
