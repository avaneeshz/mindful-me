-- Steps migrates onto the real, synced `public.daily_values` table — the
-- move `20260913060300_daily_values.sql`'s own comment explicitly
-- anticipated ("Steps ... could adopt the same table later with zero schema
-- change, since this is intentionally generalized by a metric_key column
-- rather than a protein_grams-shaped one-off table") and
-- `20260910100000_activities_entry_mode.sql` deliberately deferred ("Steps
-- is intentionally untouched: it stays the local-only plain counter it
-- always was ... out of scope"). That "later" is now: a full audit of the
-- app found Steps was the ONE confirmed data-loss gap — a plain
-- `localStorage` counter that never reached the database, lost on every
-- device switch, browser change, or reinstall.
--
-- Exactly the "zero schema change" case that was anticipated: only the
-- `metric_key` allow-list widens (both the CHECK constraint and
-- `set_daily_value`'s own belt-and-braces validation, same two places
-- `20260910090000_note_entries_extra_buttons.sql` widened for
-- `note_entries.button_key`, the established convention for extending a
-- CHECK-constrained enum-like column in this project: drop the
-- auto-named constraint, add it back with the wider list, rather than any
-- kind of in-place ALTER). Nothing about the table shape, RLS policies
-- (already scoped to auth.uid(), not metric-specific), or grants changes —
-- none of that is metric-specific either.
--
-- `list_daily_values` never validated `metric_key` against the enum (only
-- filters by it, same as `list_note_entries`'s own `button_key`) — nothing
-- to widen there.
--
-- Existing local-only Steps data already sitting in a user's browser
-- `localStorage` is backfilled client-side on next load
-- (`state/useStepsBackfill.ts`) — not this migration's concern; this only
-- makes the server able to accept 'steps' rows at all.

alter table public.daily_values drop constraint daily_values_metric_key_check;
alter table public.daily_values add constraint daily_values_metric_key_check
  check (metric_key in ('protein', 'steps'));

create or replace function public.set_daily_value(
  p_metric_key text,
  p_local_date date,
  p_value integer
) returns public.daily_value_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.daily_values;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_metric_key not in ('protein', 'steps') then
    raise exception 'invalid_metric_key' using errcode = '22023';
  end if;

  if p_value is null or p_value < 0 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  insert into public.daily_values (user_id, metric_key, local_date, value)
  values (auth.uid(), p_metric_key, p_local_date, p_value)
  on conflict (user_id, metric_key, local_date) do update set value = excluded.value
  where public.daily_values.user_id = auth.uid()
  returning * into v_row;

  return public.to_daily_value_dto(v_row);
end;
$$;
