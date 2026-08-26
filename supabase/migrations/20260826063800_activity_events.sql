-- Phase 3: the append-only audit trail — every create, reschedule,
-- completion toggle, and removal/restore of a scheduled activity,
-- timestamped. A DB trigger writes every row, so nothing that changes
-- `scheduled_activities` can bypass it (never relying on the client or the
-- RPC layer to remember to log — a trigger cannot be skipped by a caller
-- that forgets, unlike an application-level "and also insert an event"
-- convention).
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  scheduled_activity_id uuid not null references public.scheduled_activities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (
    event_type in ('created', 'rescheduled', 'completed', 'uncompleted', 'removed', 'restored')
  ),
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index activity_events_scheduled_activity_id_idx
  on public.activity_events (scheduled_activity_id, occurred_at);
create index activity_events_user_id_idx on public.activity_events (user_id, occurred_at);

alter table public.activity_events enable row level security;

-- Append-only from the outside: no update/delete policy at all, and no
-- insert policy either — every row is written by the trigger below (which
-- runs with elevated rights of its own, not through a client-facing grant).
create policy "read own events"
  on public.activity_events for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.log_scheduled_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (scheduled_activity_id, user_id, event_type, payload)
    values (
      new.id, new.user_id, 'created',
      jsonb_build_object(
        'activity_id', new.activity_id, 'start_at', new.start_at,
        'duration_minutes', new.duration_minutes, 'status', new.status
      )
    );
    return new;
  end if;

  -- tg_op = 'UPDATE'. Several of these can legitimately fire from ONE
  -- update (e.g. rule 4's own scenario: a reschedule never touches status,
  -- but nothing stops a future caller from changing more than one facet at
  -- once) — each relevant change gets its own event row rather than a
  -- catch-all "updated".
  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.activity_events (scheduled_activity_id, user_id, event_type, payload)
    values (new.id, new.user_id, 'removed', jsonb_build_object('deleted_at', new.deleted_at));
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    insert into public.activity_events (scheduled_activity_id, user_id, event_type, payload)
    values (new.id, new.user_id, 'restored', '{}'::jsonb);
  end if;

  if old.status is distinct from new.status then
    insert into public.activity_events (scheduled_activity_id, user_id, event_type, payload)
    values (
      new.id, new.user_id,
      case when new.status = 'completed' then 'completed' else 'uncompleted' end,
      jsonb_build_object('previous_status', old.status)
    );
  end if;

  -- Rule 4: this fires independently of the status checks above — a
  -- reschedule's event never implies (or requires) a status change, and a
  -- status change's event never implies a reschedule. Neither branch can
  -- silently swallow the other, which is exactly what rule 4 requires of the
  -- APPLICATION behaviour; logging it as two distinct events (when both
  -- genuinely happen together) keeps that visible in the trail too.
  if old.start_at is distinct from new.start_at or old.duration_minutes is distinct from new.duration_minutes then
    insert into public.activity_events (scheduled_activity_id, user_id, event_type, payload)
    values (
      new.id, new.user_id, 'rescheduled',
      jsonb_build_object(
        'previous_start_at', old.start_at, 'start_at', new.start_at,
        'previous_duration_minutes', old.duration_minutes, 'duration_minutes', new.duration_minutes,
        'status_unchanged', old.status = new.status
      )
    );
  end if;

  return new;
end;
$$;

create trigger scheduled_activities_log_events
  after insert or update on public.scheduled_activities
  for each row execute function public.log_scheduled_activity_event();
