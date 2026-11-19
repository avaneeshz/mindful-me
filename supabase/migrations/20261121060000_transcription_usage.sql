-- Voice dictation: per-user usage accounting for the `transcribe` edge function.
--
-- The edge function forwards a user's short audio clip to a third-party
-- speech-to-text API (Groq Whisper, free tier). To stay inside that free tier
-- — and to stop one account burning the shared quota — usage is limited per
-- user in Postgres (CLAUDE.md portability rule 4: rules that must always hold
-- live in the backend, not only in React):
--
--   * at most 60 requests in any rolling hour, and
--   * at most 3600 seconds of audio in any rolling 24 hours.
--
-- This table stores NO audio and NO transcript text — only who, when and how
-- many seconds. Rows older than 2 days are deleted opportunistically by the
-- reserve function, so the table stays tiny.
--
-- Access: RLS is on with NO policies, and every grant is revoked from
-- anon/authenticated, so the table is unreachable through PostgREST. Only the
-- edge function (service_role) can call the two functions below.
--
-- Expand-only (WORKFLOW.md): a new table and two new functions; nothing
-- existing is changed.

create table public.transcription_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  seconds integer not null check (seconds between 1 and 600)
);

create index transcription_usage_user_created_idx
  on public.transcription_usage (user_id, created_at desc);

alter table public.transcription_usage enable row level security;
revoke all on table public.transcription_usage from public, anon, authenticated;

-- Atomically checks the user's limits and, if there is room, records the
-- request. A per-user advisory lock makes the check-then-insert race-free
-- when two clips are sent at once.
--
-- Returns jsonb:
--   { "allowed": true,  "usage_id": "<uuid>" }
--   { "allowed": false, "reason": "hourly_requests" | "daily_seconds",
--     "retry_after_seconds": <int> }
create function public.reserve_transcription_quota(p_user_id uuid, p_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_max_requests_per_hour constant integer := 60;
  c_max_seconds_per_day constant integer := 3600;
  v_seconds integer := least(greatest(coalesce(p_seconds, 1), 1), 600);
  v_hour_count integer;
  v_hour_oldest timestamptz;
  v_day_seconds integer;
  v_day_oldest timestamptz;
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('transcription_usage:' || p_user_id::text, 0));

  delete from public.transcription_usage
  where user_id = p_user_id and created_at < now() - interval '2 days';

  select count(*), min(created_at)
    into v_hour_count, v_hour_oldest
  from public.transcription_usage
  where user_id = p_user_id and created_at > now() - interval '1 hour';

  if v_hour_count >= c_max_requests_per_hour then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'hourly_requests',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_hour_oldest + interval '1 hour' - now())))::integer)
    );
  end if;

  select coalesce(sum(seconds), 0), min(created_at)
    into v_day_seconds, v_day_oldest
  from public.transcription_usage
  where user_id = p_user_id and created_at > now() - interval '24 hours';

  if v_day_seconds + v_seconds > c_max_seconds_per_day then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_seconds',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_day_oldest + interval '24 hours' - now())))::integer)
    );
  end if;

  insert into public.transcription_usage (user_id, seconds)
  values (p_user_id, v_seconds)
  returning id into v_id;

  return jsonb_build_object('allowed', true, 'usage_id', v_id);
end;
$$;

-- Gives a reservation back when the upstream call failed, so a provider
-- outage never eats the user's quota.
create function public.release_transcription_quota(p_user_id uuid, p_usage_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.transcription_usage
  where id = p_usage_id and user_id = p_user_id
$$;

revoke all on function public.reserve_transcription_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_transcription_quota(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_transcription_quota(uuid, integer) to service_role;
grant execute on function public.release_transcription_quota(uuid, uuid) to service_role;
