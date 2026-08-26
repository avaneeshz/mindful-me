-- Trigger functions never need a direct EXECUTE grant to any API role — a
-- trigger invokes them regardless of grants, using the function's own
-- privileges. Supabase's default-privileges grant still exposed this one as
-- a callable /rest/v1/rpc endpoint; revoke it.
revoke execute on function public.log_scheduled_activity_event() from public, anon, authenticated;
