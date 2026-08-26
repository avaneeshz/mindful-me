-- Phase 2: scheduled_activities — one row per logical activity instance,
-- the source of truth for "what's on the day" (Target Architecture). Mirrors
-- the Phase-1 client `ScheduledActivity` shape 1:1: a real start time, an
-- arbitrary duration, and nothing that depends on the 30-minute grid (which
-- stays a client-only rendering concern).
create table public.scheduled_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Null only for a flag-only marker (mirrors the client's zero-duration,
  -- name-null ScheduledActivity — see domain/types.ts on the client).
  activity_id uuid references public.activities (id),
  path text[] not null default '{}',

  -- Rule 3 — wall-clock time locked in at creation. `start_at`/`end_at` are
  -- the authoritative REAL instants (used for ordering and the overlap
  -- constraint below); `local_date` + `start_minute` freeze the exact
  -- wall-clock the user saw at creation, written once and never recomputed
  -- from `start_at` — so a later timezone rule change or DST transition can
  -- never retroactively shift what a past entry displays as. Rule 2 — an
  -- activity belongs to the calendar day it started on: `local_date` IS that
  -- day, by construction.
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  local_date date not null,
  start_minute smallint not null check (start_minute >= 0 and start_minute < 1440),
  timezone text not null,
  constraint end_after_start check (end_at >= start_at),
  constraint end_matches_duration check (end_at = start_at + make_interval(mins => duration_minutes)),
  -- A flag-only marker (activity_id null) always carries zero duration —
  -- the DB-level mirror of the client's `flagMarkerAt` invariant.
  constraint flag_marker_has_no_duration check (activity_id is not null or duration_minutes = 0),

  -- Rule 10 — encrypted at rest; see 20260826063300_flags_encryption.sql.
  -- Never a plain `flags text[]` column.
  flags_encrypted bytea,

  -- Phase 3 wires this to the UI and the audit trail; the column lives here
  -- because it is part of the activity's own identity, not a later add-on.
  status text not null default 'planned' check (status in ('planned', 'completed')),

  -- Rule 11 — delete is immediate from the user's view, recoverable for 30
  -- days, then purged. A non-null `deleted_at` is an immediate soft delete;
  -- `purge_deleted_scheduled_activities` (below) hard-deletes anything past
  -- the 30-day window on a daily schedule.
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scheduled_activities_user_range_idx
  on public.scheduled_activities (user_id, start_at)
  where deleted_at is null;
-- Rule 8 — every read of "today"/"this week" is scoped to that window. This
-- is the index that scoping actually uses (a query that filters on
-- user_id + local_date range never has to touch the user's full history).
create index scheduled_activities_user_local_date_idx
  on public.scheduled_activities (user_id, local_date)
  where deleted_at is null;
create index scheduled_activities_activity_id_idx on public.scheduled_activities (activity_id);

-- Rule 1 — no two activities may ever overlap, enforced here as a real DB
-- constraint (never relying on the API-layer check in domain/scheduling.ts
-- alone). btree_gist lets the equality column (user_id) share a GiST index
-- with the range overlap operator. A zero-duration flag marker produces an
-- EMPTY tstzrange ('[)' with start_at = end_at), which never overlaps
-- anything, so markers are naturally exempt without a special case — the
-- `duration_minutes > 0` predicate below is belt-and-braces clarity, not
-- load-bearing. Soft-deleted rows are excluded, so removing an activity
-- immediately frees its time for a new one (rule 11's "immediate from the
-- user's view").
alter table public.scheduled_activities
  add constraint no_overlapping_activities
  exclude using gist (
    user_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (deleted_at is null and duration_minutes > 0);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scheduled_activities_set_updated_at
  before update on public.scheduled_activities
  for each row execute function public.set_updated_at();

alter table public.scheduled_activities enable row level security;

-- Rule 10 — every query is scoped to the authenticated user, no cross-user
-- reads. `deleted_at is null` in the select policy is what makes rule 11's
-- "immediate from the user's view" hold at the RLS layer, not merely by
-- convention in application queries.
create policy "read own, non-deleted activities"
  on public.scheduled_activities for select
  to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy "insert own activities"
  on public.scheduled_activities for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own activities"
  on public.scheduled_activities for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No delete policy: the client never issues a hard DELETE (rule 11) — an
-- app-level "delete" is an UPDATE that sets deleted_at. Only the purge job
-- below hard-deletes, running as postgres and so unaffected by RLS.

create or replace function public.purge_deleted_scheduled_activities()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.scheduled_activities
  where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;

select cron.schedule(
  'purge-deleted-scheduled-activities',
  '0 3 * * *', -- daily at 03:00 UTC
  $$select public.purge_deleted_scheduled_activities()$$
)
where not exists (
  select 1 from cron.job where jobname = 'purge-deleted-scheduled-activities'
);
