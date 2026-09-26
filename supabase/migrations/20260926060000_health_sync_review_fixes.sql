-- Self-review-verified fixes (four findings, `/code-review` against
-- `develop...claude/dazzling-ride-3f05tt`, independently confirmed by
-- reading the actual function/policy bodies) before this branch merges into
-- develop.

-- ---------------------------------------------------------------------
-- Finding 1 (blocking): "update own connections" (20260925060000) has no
-- column restriction. A row-level USING/WITH CHECK predicate only decides
-- WHICH ROWS a client may touch — not WHICH COLUMNS. Table-level UPDATE is
-- granted to `authenticated` by Supabase's own default privileges on every
-- public-schema table, so as shipped a signed-in user could
-- `PATCH /rest/v1/external_connections?provider=eq.google_health` with an
-- arbitrary body and rewrite `access_token_encrypted`,
-- `refresh_token_encrypted`, `status`, `expires_at`, `scopes` directly —
-- exactly the direct-write path this table's own first migration says does
-- not exist ("every write is a service_role call through a SECURITY
-- DEFINER wrapper").
--
-- CONFIRMED: `scheduled_activities`' own "update own activities" policy
-- (20260826063400_scheduled_activities.sql) has the identical column-
-- unrestricted latitude — this is not something this migration invented,
-- it is a pre-existing, separate issue on a table this feature does not
-- touch, and is left alone here (out of scope for this PR).
--
-- Fix, for `external_connections` only: a column-level GRANT is the actual
-- boundary PostgREST respects for which columns a role may write —
-- independent of, and layered underneath, the row-level policy. Revoking
-- blanket UPDATE and granting it back for `deleted_at` alone means a direct
-- client PATCH touching any other column now fails at the privilege check,
-- regardless of what the request body contains or what row the policy
-- would otherwise allow. `disconnect_health_connection` /
-- `restore_health_connection` (SECURITY INVOKER, run as the calling role)
-- only ever set `deleted_at`, so neither is affected.
revoke update on public.external_connections from anon, authenticated;
grant update (deleted_at) on public.external_connections to authenticated;

-- ---------------------------------------------------------------------
-- Finding 2 (DB half — see supabase/functions/_shared/runHealthSync.ts for
-- the call-site change): `upsert_external_connection`'s
-- `on conflict ... do update` unconditionally clears `deleted_at = null`,
-- which is correct for a fresh OAuth consent (health-sync-oauth-callback)
-- but wrong for a mid-sync token refresh — a disconnect landing between
-- the sync's initial read and the refresh completing would have its
-- `deleted_at` silently cleared back to null by the refresh's own write.
--
-- Fix: a narrower, service_role-only function used ONLY by the sync path's
-- refresh step, which never touches `deleted_at` and — critically — is
-- scoped `where id = p_id and deleted_at is null`, so it becomes a no-op
-- (0 rows) rather than a resurrection if the connection was disconnected
-- out from under it. `runHealthSync.ts` now checks its return value and
-- stops the sync run rather than proceeding as if the refresh succeeded.
create function public.update_external_connection_access_token(
  p_id uuid,
  p_access_token text,
  p_expires_at timestamptz,
  p_refresh_token text default null
) returns boolean
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_count integer;
begin
  update public.external_connections
  set
    access_token_encrypted = internal.encrypt_external_token(p_access_token),
    refresh_token_encrypted = coalesce(internal.encrypt_external_token(p_refresh_token), refresh_token_encrypted),
    expires_at = p_expires_at
  where id = p_id and deleted_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.update_external_connection_access_token(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.update_external_connection_access_token(uuid, text, timestamptz, text) to service_role;

-- Same spirit, cheap to close at the same time: the sync run's own
-- end-of-run bookkeeping call should not still touch a row that was
-- disconnected during the run either. It never wrote `deleted_at` to begin
-- with, so this was never a resurrection risk — only unnecessary
-- `last_synced_at`/`status` churn on a row that's supposed to be inert
-- once soft-deleted. Belt and braces, not a second instance of finding 2.
create or replace function public.mark_external_connection_synced(
  p_id uuid,
  p_status text,
  p_last_error text default null,
  p_sync_state jsonb default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.external_connections
  set
    last_synced_at = now(),
    status = p_status,
    last_error = p_last_error,
    sync_state = coalesce(p_sync_state, sync_state)
  where id = p_id and deleted_at is null
$$;

-- ---------------------------------------------------------------------
-- Finding 4: get_health_connection_status / list_health_data_type_summaries
-- / list_health_metrics (20260921070000) and restore_health_connection
-- (20260925060000) shipped with no explicit grant/revoke, unlike every
-- other function in this feature. All four are SECURITY INVOKER, so RLS
-- already protects the actual data — an anon caller gets nothing back
-- regardless — but that's a coincidence of these particular function
-- bodies, not a real lockdown, and inconsistent with this PR's own stated
-- discipline everywhere else. Closing it explicitly now, before some later
-- change to one of these relies on the DB-level lockdown already being
-- real.
revoke all on function public.get_health_connection_status(text) from public, anon;
grant execute on function public.get_health_connection_status(text) to authenticated;

revoke all on function public.list_health_data_type_summaries(text) from public, anon;
grant execute on function public.list_health_data_type_summaries(text) to authenticated;

revoke all on function public.list_health_metrics(text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_health_metrics(text, text, timestamptz, timestamptz) to authenticated;

revoke all on function public.restore_health_connection(text) from public, anon;
grant execute on function public.restore_health_connection(text) to authenticated;
