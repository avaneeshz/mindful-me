-- Security-advisor-verified gap (found via get_advisors immediately after
-- 20260925060000 landed) — same root cause as
-- 20260826063600_lock_down_function_grants.sql already documented for
-- purge_deleted_scheduled_activities: Supabase's default privileges
-- auto-grant EXECUTE on a new public-schema function to `anon` and
-- `authenticated` directly. The purge job is invoked only by pg_cron (as
-- postgres); no API role, signed in or not, should ever reach it over
-- PostgREST.
revoke execute on function public.purge_deleted_external_connections() from public, anon, authenticated;

-- Also verified: get_health_connection_recoverable's authenticated-callable
-- SECURITY DEFINER warning is expected and intentional, not a gap — see its
-- own doc comment in 20260925060000_health_sync_soft_delete.sql for why
-- (a narrow, explicit-check, boolean-only escape hatch past what the
-- deleted_at is null SELECT policy deliberately hides, needed specifically
-- so the client can offer a real "reconnect" affordance). Left as is.
