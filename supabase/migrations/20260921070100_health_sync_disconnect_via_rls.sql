-- Security-advisor-verified gap (found via get_advisors after the previous
-- migration landed, same discipline as 20260826064100's own fix): every
-- other user-driven write in this schema is SECURITY INVOKER, relying on
-- RLS as the real enforcement boundary ("every RPC here runs as the calling
-- user ... so row-level security is always the real enforcement boundary" —
-- 20260826063500_scheduling_api.sql). disconnect_health_connection was
-- written as SECURITY DEFINER with a hand-rolled auth.uid() check instead,
-- which the linter correctly flags as a signed-in-callable DEFINER function
-- — an unnecessary deviation from this schema's own pattern, not something
-- it actually needed (there was no reason it couldn't just be a DELETE
-- policy like everything else).
--
-- Fix: add the missing DELETE policy, and redefine the function as
-- SECURITY INVOKER so RLS is what actually stops a user deleting anyone
-- else's connection, not the function body.
create policy "delete own connections"
  on public.external_connections for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.disconnect_health_connection(p_provider text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.external_connections
  where user_id = auth.uid() and provider = p_provider;
end;
$$;
