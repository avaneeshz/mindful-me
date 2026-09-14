-- Regression of the exact bug already found and fixed once for
-- `scheduled_activities` (20260826063900_fix_select_policy_blocking_soft_delete.sql):
-- Postgres RLS re-checks an UPDATE's resulting row against the table's
-- SELECT policy, not only the UPDATE policy's own WITH CHECK. Confirmed
-- empirically again here — `delete_note_entry` (a bare
-- `update ... set deleted_at = now() ...`) fails every single time with
-- "new row violates row-level security policy for table note_entries",
-- because 20260913070000_note_entries_edit_delete.sql's SELECT policy
-- required `deleted_at is null`, which the row being soft-deleted no longer
-- satisfies immediately AFTER that same update. That made
-- `delete_note_entry` — and therefore rule 11 for note entries — impossible
-- to ever succeed: every "Remove" in `NoteButtonPill` silently no-ops
-- server-side (the client removes it from local state optimistically and
-- never surfaces the failure — see `api/notes.ts`'s
-- `apiDeleteNoteEntry`/`useNoteEntries.ts` fire-and-forget `console.warn` —
-- so the note reappears on the next full reload once the server's list wins
-- reconciliation).
--
-- The fix is the same one already applied to `scheduled_activities`: RLS's
-- job here is only rule 10 ("no cross-user reads, ever") — `user_id =
-- auth.uid()` alone fully satisfies that. Hiding soft-deleted rows from
-- "today's/this button's history" is already handled at the query layer,
-- where it belongs — `list_note_entries` and `list_note_entries_for_date`
-- both already filter `deleted_at is null` themselves.
drop policy "read own, non-deleted note entries" on public.note_entries;
create policy "read own note entries"
  on public.note_entries for select
  to authenticated
  using (user_id = (select auth.uid()));
