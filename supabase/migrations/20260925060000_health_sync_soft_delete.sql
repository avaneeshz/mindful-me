-- Coordinator-requested fix: disconnect was hard-deleting
-- `external_connections` (and, via FK cascade, `health_metrics`)
-- immediately. Rule 11 says "recoverable for 30 days" with no carve-out for
-- externally-sourced data, so this replicates the EXACT existing
-- `scheduled_activities` soft-delete shape (20260826063400_scheduled_
-- activities.sql / 20260826063500_scheduling_api.sql /
-- 20260905090000_scheduled_activity_quality_multiselect.sql's
-- restore_scheduled_activity) rather than inventing a new pattern:
--   - a `deleted_at` column
--   - the SELECT policy requires `deleted_at is null`
--   - "delete" is a plain UPDATE setting `deleted_at = now()`, relying on a
--     general "update own row" RLS policy — not its own DEFINER escape hatch
--   - a daily cron purge job, hard-deleting only once 30 days have passed,
--     guarded by the identical idempotent `where not exists (select 1 from
--     cron.job where jobname = ...)` check
--   - `restore_*` clears `deleted_at` back to null, still just a plain
--     UPDATE under the same general policy (no dedicated DELETE policy is
--     needed for any of this, so the one added in 20260921070100 is dropped)

alter table public.external_connections add column deleted_at timestamptz;

drop policy "read own connections" on public.external_connections;
create policy "read own connections"
  on public.external_connections for select
  to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

-- No longer needed: disconnect is an UPDATE now, not a DELETE.
drop policy "delete own connections" on public.external_connections;

-- Mirrors "update own activities" exactly — general purpose, not scoped to
-- only the deleted_at column (same latitude that table's own equivalent
-- policy already has). Disconnect/restore below are the only things that
-- currently exercise it, but it is not itself delete-specific.
create policy "update own connections"
  on public.external_connections for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Reconnecting via a brand new OAuth grant must always resurrect a
-- previously soft-deleted row rather than silently updating tokens on a row
-- RLS is still hiding — a fresh, successful consent is unambiguous consent
-- to be connected again.
create or replace function public.upsert_external_connection(
  p_user_id uuid,
  p_provider text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_scopes text[],
  p_status text default 'connected'
) returns uuid
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;

  insert into public.external_connections (
    user_id, provider, access_token_encrypted, refresh_token_encrypted,
    expires_at, scopes, status, last_error, deleted_at
  ) values (
    p_user_id, p_provider,
    internal.encrypt_external_token(p_access_token),
    internal.encrypt_external_token(p_refresh_token),
    p_expires_at, coalesce(p_scopes, '{}'), p_status, null, null
  )
  on conflict (user_id, provider) do update set
    access_token_encrypted = excluded.access_token_encrypted,
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, public.external_connections.refresh_token_encrypted),
    expires_at = excluded.expires_at,
    scopes = excluded.scopes,
    status = excluded.status,
    last_error = null,
    deleted_at = null
  returning id into v_id;

  return v_id;
end;
$$;

-- The sync path is SECURITY DEFINER (service_role only) and so bypasses RLS
-- entirely — it must filter `deleted_at is null` itself, or a soft-deleted
-- (disconnected, still within its 30-day recovery window) connection would
-- keep silently syncing, which is exactly what disconnect is supposed to
-- stop immediately.
create or replace function public.get_external_connection_for_sync(p_user_id uuid, p_provider text)
returns table (
  id uuid,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  status text,
  sync_state jsonb
)
language sql
stable
security definer
set search_path = public, internal, pg_temp
as $$
  select
    c.id,
    internal.decrypt_external_token(c.access_token_encrypted),
    internal.decrypt_external_token(c.refresh_token_encrypted),
    c.expires_at, c.scopes, c.status, c.sync_state
  from public.external_connections c
  where c.user_id = p_user_id and c.provider = p_provider and c.deleted_at is null
$$;

-- Disconnect: now a plain UPDATE under the general "update own connections"
-- policy above — no DEFINER, no hand-rolled auth check, exactly the shape
-- soft_delete_scheduled_activity uses. `deleted_at is null` in the WHERE
-- clause makes a repeat disconnect a harmless no-op (0 rows) rather than
-- clobbering an already-recorded `deleted_at`.
create or replace function public.disconnect_health_connection(p_provider text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.external_connections
  set deleted_at = now()
  where user_id = auth.uid() and provider = p_provider and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Restore — the actual "recoverable" half of rule 11, mirroring
-- restore_scheduled_activity exactly (including: no explicit 30-day check
-- here, same as that function — the purge job below is the only thing that
-- enforces the window, so a restore attempt on an already-purged
-- connection simply finds no row and reports not_found, same failure mode
-- restore_scheduled_activity already has).
create or replace function public.restore_health_connection(p_provider text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.external_connections
  set deleted_at = null
  where user_id = auth.uid() and provider = p_provider and deleted_at is not null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- The one piece of information the client genuinely needs that RLS's own
-- `deleted_at is null` SELECT policy deliberately hides: whether there IS a
-- recently-disconnected, still-recoverable row, so the UI can offer a real
-- "Reconnect" (restore, below) instead of only ever a fresh OAuth grant.
-- SECURITY DEFINER is the right call here specifically because the whole
-- point is to see past what the SELECT policy hides — not a workaround for
-- something a plain policy could have done, unlike the disconnect function
-- this migration just moved away from DEFINER. Returns a bare boolean only
-- — never a token, a scope list, or anything else that policy protects.
create or replace function public.get_health_connection_recoverable(p_provider text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.external_connections
    where user_id = auth.uid() and provider = p_provider and deleted_at is not null
  )
$$;

revoke all on function public.get_health_connection_recoverable(text) from public, anon;
grant execute on function public.get_health_connection_recoverable(text) to authenticated;

-- health_metrics must also stop being visible the instant its connection is
-- soft-deleted — enforced at the RLS layer (not just by the app no longer
-- asking), via the same "does an active parent connection exist" check the
-- sync path now makes explicitly. This is what makes it safe to drop the
-- `ON DELETE CASCADE` hard-delete-on-disconnect this migration replaces:
-- the rows still physically exist for the 30-day window, but are exactly as
-- unreadable to the user's own session as if they were already gone.
drop policy "read own health metrics" on public.health_metrics;
create policy "read own health metrics"
  on public.health_metrics for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.external_connections c
      where c.id = health_metrics.connection_id and c.deleted_at is null
    )
  );

-- The purge job — its own function/job, mirroring
-- purge_deleted_scheduled_activities's shape one-for-one rather than
-- folding into it (one job per concern, per the coordinator's preference).
-- `health_metrics` needs no purge job of its own: once a connection is hard
-- -deleted here, the existing `on delete cascade` FK removes its metrics in
-- the same statement.
create or replace function public.purge_deleted_external_connections()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.external_connections
  where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;

select cron.schedule(
  'purge-deleted-external-connections',
  '0 3 * * *', -- daily at 03:00 UTC, same slot as the scheduled_activities purge
  $$select public.purge_deleted_external_connections()$$
)
where not exists (
  select 1 from cron.job where jobname = 'purge-deleted-external-connections'
);
