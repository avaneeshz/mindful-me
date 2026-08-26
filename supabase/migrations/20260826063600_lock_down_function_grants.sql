-- Supabase's default privileges auto-grant EXECUTE on newly created public-
-- schema functions to anon and authenticated directly (not merely via the
-- PUBLIC pseudo-role), so `revoke ... from public` alone did not remove
-- anon's access — confirmed via has_function_privilege. Revoke explicitly
-- from every role, then grant back only what each function actually needs.
-- encrypt_flags/decrypt_flags resolve the Vault key (rule 10): anon must
-- never reach them; authenticated needs them only because the (non-definer)
-- CRUD RPCs below call them in the caller's own security context.
revoke execute on function public.encrypt_flags(text[]) from public, anon, authenticated;
revoke execute on function public.decrypt_flags(bytea) from public, anon, authenticated;
grant execute on function public.encrypt_flags(text[]) to authenticated, service_role;
grant execute on function public.decrypt_flags(bytea) to authenticated, service_role;

-- The purge job is invoked only by pg_cron (as postgres); no API role, signed
-- in or not, should ever be able to call it directly over PostgREST.
revoke execute on function public.purge_deleted_scheduled_activities() from public, anon, authenticated;

-- Belt and braces: re-assert the CRUD RPC grants are authenticated-only, not
-- also reachable by anon through the same default-privileges path.
revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[]) from public, anon;
revoke execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text) from public, anon;
revoke execute on function public.set_scheduled_activity_status(uuid, text) from public, anon;
revoke execute on function public.set_scheduled_activity_flags(uuid, text[]) from public, anon;
revoke execute on function public.soft_delete_scheduled_activity(uuid) from public, anon;
revoke execute on function public.restore_scheduled_activity(uuid) from public, anon;
revoke execute on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;
revoke execute on function public.scheduling_ceiling(uuid, timestamptz, uuid) from public, anon;

-- `set_updated_at` had no pinned search_path (flagged by the linter) — a
-- trigger function with a mutable search_path is a privilege-escalation
-- vector if a lower-privileged role could ever redefine an object in an
-- earlier search_path entry. It touches no other objects, so pin it to
-- nothing beyond pg_temp.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
