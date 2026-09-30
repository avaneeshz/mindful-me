-- Hourly background Health Sync, so data is fresh even while the app is closed.
--
-- pg_cron runs `enqueue_hourly_health_syncs()` every hour. For each connection
-- that the app hasn't already synced in the last 30 minutes, it queues step 0
-- of an `auto` sync (quick, promoted to full every 6 hours — the same rule the
-- app uses) as a pg_net POST to the `health-sync-cron` edge function. That
-- function runs one bounded slice and queues the next through
-- `enqueue_health_sync`, so a full sync is a chain of short calls.
--
-- Two Vault secrets, per environment:
--   health_sync_cron_token  shared secret the function checks. Created here.
--   health_sync_cron_url    the function's URL. Set once per project after
--                           deploying the function, e.g.
--                           select vault.create_secret(
--                             'https://<ref>.supabase.co/functions/v1/health-sync-cron',
--                             'health_sync_cron_url');
-- Without the URL nothing is queued, so this migration is safe to apply first.

create extension if not exists pg_net;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'health_sync_cron_token',
  'Shared secret the health-sync-cron edge function checks on every call.'
)
where not exists (select 1 from vault.secrets where name = 'health_sync_cron_token');

-- The edge function's only authentication (it runs with JWT verification off).
create or replace function public.verify_health_sync_cron_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(length(p_token) > 0, false) and exists (
    select 1 from vault.decrypted_secrets
    where name = 'health_sync_cron_token' and decrypted_secret = p_token
  );
$$;

revoke all on function public.verify_health_sync_cron_token(text) from public, anon, authenticated;
grant execute on function public.verify_health_sync_cron_token(text) to service_role;

-- Queues one slice of a background sync. Returns false when the URL isn't set.
create or replace function public.enqueue_health_sync(p_user_id uuid, p_step integer default 0, p_mode text default 'auto')
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_token text;
begin
  if p_mode not in ('auto', 'quick', 'full') or p_step < 0 then
    raise exception 'invalid health sync step' using errcode = '22023';
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'health_sync_cron_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'health_sync_cron_token';
  if v_url is null or v_token is null then
    return false;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('userId', p_user_id, 'step', p_step, 'mode', p_mode),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-health-sync-token', v_token),
    timeout_milliseconds := 60000
  );
  return true;
end;
$$;

revoke all on function public.enqueue_health_sync(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.enqueue_health_sync(uuid, integer, text) to service_role;

-- One queued sync per live connection the app hasn't synced recently. A
-- connection waiting on re-authorization is skipped: syncing can't fix it.
create or replace function public.enqueue_hourly_health_syncs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_count integer := 0;
begin
  for v_user in
    select distinct user_id
    from public.external_connections
    where deleted_at is null
      and status in ('connected', 'error')
      and (last_synced_at is null or last_synced_at < now() - interval '30 minutes')
  loop
    if public.enqueue_health_sync(v_user, 0, 'auto') then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_hourly_health_syncs() from public, anon, authenticated;

select cron.schedule(
  'health-sync-hourly',
  '7 * * * *', -- hourly, off the top of the hour
  $$select public.enqueue_hourly_health_syncs()$$
)
where not exists (select 1 from cron.job where jobname = 'health-sync-hourly');

-- The edge function calls the new functions through the API; make it see them now.
notify pgrst, 'reload schema';
