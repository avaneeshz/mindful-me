-- Bug found while verifying Phase 3: Postgres RLS re-checks an UPDATE's
-- resulting row against the table's SELECT policy (not only the UPDATE
-- policy's own WITH CHECK) — confirmed empirically: a raw
-- `update ... set deleted_at = now() ...` was rejected with "new row
-- violates row-level security policy" specifically because the SELECT
-- policy required `deleted_at is null`, which the row being soft-deleted no
-- longer satisfies AFTER the update. That made `soft_delete_scheduled_
-- activity` — and therefore rule 11 itself — impossible to ever succeed.
--
-- The fix: RLS's job here is only rule 10 ("no cross-user reads, ever") —
-- `user_id = auth.uid()` alone fully satisfies that. Hiding soft-deleted
-- rows from "today's board" is already handled at the query layer, where it
-- belongs: `list_scheduled_activities` filters `deleted_at is null` itself.
drop policy "read own, non-deleted activities" on public.scheduled_activities;
create policy "read own activities"
  on public.scheduled_activities for select
  to authenticated
  using (user_id = (select auth.uid()));
