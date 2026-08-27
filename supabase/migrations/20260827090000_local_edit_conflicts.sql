-- Phase 5: rule 7 — "conflicting edits from two devices: newest edit wins,
-- the older one is KEPT (in activity_events), never silently discarded."
--
-- Every conflict the DB itself can see is already kept: the trigger in
-- 20260826063800_activity_events.sql logs each device's write as it lands, so
-- the version that LOST because a newer write overwrote it is still in the
-- trail. What is not covered is the other direction — an edit made on this
-- device that never became a row at all, because by the time it reached the
-- server a newer edit from another device had already won (or because the
-- server refused it outright: the time is taken, or the row is gone). That
-- edit exists only on the losing device, so it needs a way in.
--
-- Two new event types carry it, and `scheduled_activity_id` becomes nullable
-- because a rejected CREATE never produced a row for the FK to point at.

alter table public.activity_events
  alter column scheduled_activity_id drop not null;

alter table public.activity_events
  drop constraint activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check check (
    event_type in (
      'created', 'rescheduled', 'completed', 'uncompleted', 'removed', 'restored',
      -- A queued local edit that lost to a newer server version on read.
      'superseded_local_edit',
      -- A queued local edit the server refused outright on write.
      'rejected_local_edit'
    )
  );

-- The only client-facing way to write to `activity_events`. SECURITY DEFINER
-- because the table has no insert policy at all (append-only from outside,
-- trigger-written from inside) — this is a deliberate, narrow second door,
-- not a general grant:
--   * it can only ever write the two conflict event types, never forge a
--     'created'/'rescheduled'/... event that the trigger alone is trusted to
--     produce;
--   * user_id is taken from auth.uid(), never from the caller;
--   * a supplied scheduled_activity_id is accepted only if that row really
--     belongs to the caller, so it can never attach a note to someone else's
--     activity (rule 10 — every query scoped to the authenticated user).
create or replace function public.record_local_edit_conflict(
  p_scheduled_activity_id uuid,
  p_event_type text,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_target uuid;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_event_type not in ('superseded_local_edit', 'rejected_local_edit') then
    raise exception 'invalid_event_type' using errcode = '22023';
  end if;

  -- Silently degrades to an unattached record rather than failing, on
  -- purpose: a conflict note must never be LOST because the row it refers to
  -- has since been purged (rule 11's 30-day window) or belongs to someone
  -- else. Keeping the payload is the point.
  select s.id into v_target
  from public.scheduled_activities s
  where s.id = p_scheduled_activity_id and s.user_id = v_user_id;

  insert into public.activity_events (scheduled_activity_id, user_id, event_type, payload)
  values (v_target, v_user_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_local_edit_conflict(uuid, text, jsonb) from public, anon;
grant execute on function public.record_local_edit_conflict(uuid, text, jsonb) to authenticated;

-- Rule 8 stays intact for reading them back: bounded by a `since` instant and
-- a hard row cap, never "every conflict this account has ever had".
create or replace function public.list_local_edit_conflicts(
  p_since timestamptz,
  p_limit integer default 50
) returns setof public.activity_events
language sql
stable
set search_path = public, pg_temp
as $$
  select e.*
  from public.activity_events e
  where e.user_id = auth.uid()
    and e.event_type in ('superseded_local_edit', 'rejected_local_edit')
    and e.occurred_at >= p_since
  order by e.occurred_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.list_local_edit_conflicts(timestamptz, integer) from public, anon;
grant execute on function public.list_local_edit_conflicts(timestamptz, integer) to authenticated;
