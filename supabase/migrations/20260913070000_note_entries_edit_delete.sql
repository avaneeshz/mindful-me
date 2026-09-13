-- BACKLOG.md "Deferred from the same request — editable history across
-- every header control", item 1: note_entries was append-only by design
-- (20260905090000_note_entries.sql's own comment says so explicitly) --
-- this migration is the deliberate reversal of that, now that the product
-- ask is real: let the user edit or remove a past note in place.
--
-- Two things land together:
--   1. `updated_at` (bumped by a trigger, mirroring daily_values' and
--      supplement_completions' own updated_at pattern exactly) so the client
--      can tell an edited note from an untouched one.
--   2. Soft delete, NOT a real DELETE RLS policy — rule 11 ("delete is
--      immediate from the user's view, recoverable for 30 days, then
--      purged") applies here exactly as it already does to
--      `scheduled_activities` (20260826063400_scheduled_activities.sql /
--      20260826063500_scheduling_api.sql), and this migration mirrors that
--      table's pattern verbatim: a nullable `deleted_at`, the select policy
--      excludes it, `delete_note_entry` is an UPDATE (not a real DELETE) so
--      there is deliberately no DELETE RLS policy, and a daily purge job
--      hard-deletes anything past the 30-day window running as `postgres`
--      (unaffected by RLS). The BACKLOG.md handoff's literal wording asked
--      for "UPDATE/DELETE RLS policies" — the DELETE half of that is
--      superseded by rule 11 once you're actually in this code, the same way
--      every other deletable row in this project already works; noted here
--      rather than silently doing something the handoff didn't say.

alter table public.note_entries add column updated_at timestamptz not null default now();
alter table public.note_entries add column deleted_at timestamptz;

create or replace function public.set_note_entries_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger note_entries_set_updated_at
  before update on public.note_entries
  for each row execute function public.set_note_entries_updated_at();

-- Rule 10/11 — the select policy is what makes "immediate from the user's
-- view" hold at the RLS layer (not merely application convention), same as
-- `scheduled_activities`' "read own, non-deleted activities" policy.
drop policy "read own note entries" on public.note_entries;
create policy "read own, non-deleted note entries"
  on public.note_entries for select
  to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy "update own note entries"
  on public.note_entries for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No delete policy — see the top-of-file note. An app-level "delete" is an
-- UPDATE that sets deleted_at (`delete_note_entry` below); only the purge
-- job hard-deletes.

-- `deleted_at` is deliberately NOT added to the DTO — same as
-- `scheduled_activity_dto`, the select policy already guarantees a client
-- never sees a soft-deleted row in the first place.
alter type public.note_entry_dto add attribute updated_at timestamptz;

create or replace function public.to_note_entry_dto(r public.note_entries)
returns public.note_entry_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(
    r.id, r.button_key, internal.decrypt_note_entry_text(r.note_encrypted), r.gift_type, r.created_at, r.updated_at
  )::public.note_entry_dto
$$;

-- Both existing list RPCs gain an explicit `deleted_at is null` filter —
-- belt-and-braces on top of the select policy above, same convention every
-- list RPC in this project already follows for its own explicit
-- `user_id = auth.uid()` filter.
create or replace function public.list_note_entries(p_button_key text)
returns setof public.note_entry_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_note_entry_dto(n)
  from public.note_entries n
  where n.user_id = auth.uid()
    and n.button_key = p_button_key
    and n.deleted_at is null
  order by n.created_at desc;
$$;

create or replace function public.list_note_entries_for_date(
  p_range_start timestamptz,
  p_range_end timestamptz
) returns setof public.note_entry_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_note_entry_dto(n)
  from public.note_entries n
  where n.user_id = auth.uid()
    and n.created_at >= p_range_start
    and n.created_at < p_range_end
    and n.deleted_at is null
  order by n.created_at desc;
$$;

-- Edits the note text (and, for a typed button, its type) of one of the
-- caller's own notes. `button_key` itself is never editable — a note stays
-- under the button it was written from. SECURITY INVOKER (the default),
-- same as `create_note_entry` — the explicit `user_id = auth.uid()` filters
-- below are belt-and-braces on top of the update RLS policy, not the real
-- enforcement boundary.
create or replace function public.update_note_entry(
  p_id uuid,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_key text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  select button_key into v_button_key
  from public.note_entries
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if v_button_key is null then
    raise exception 'note_entry_not_found' using errcode = 'P0002';
  end if;

  if v_button_key = 'gifts' then
    if p_gift_type is null or p_gift_type not in ('Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier') then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  update public.note_entries
  set note_encrypted = internal.encrypt_note_entry_text(p_note),
      gift_type = case when v_button_key = 'gifts' then p_gift_type else null end
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

-- Rule 11's "immediate from the user's view" app-level delete — an UPDATE,
-- never a real DELETE (see the top-of-file note and
-- `soft_delete_scheduled_activity`'s identical shape).
create or replace function public.delete_note_entry(p_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.note_entries
  set deleted_at = now()
  where id = p_id and user_id = auth.uid() and deleted_at is null;
$$;

-- Rule 11's 30-day purge, mirroring `purge_deleted_scheduled_activities`
-- exactly: SECURITY DEFINER so it can act across the RLS boundary, invoked
-- only by pg_cron (as postgres) — no API role gets EXECUTE on it.
create or replace function public.purge_deleted_note_entries()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.note_entries
  where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;

select cron.schedule(
  'purge-deleted-note-entries',
  '0 3 * * *', -- daily at 03:00 UTC, same schedule as the scheduled_activities purge
  $$select public.purge_deleted_note_entries()$$
)
where not exists (
  select 1 from cron.job where jobname = 'purge-deleted-note-entries'
);

-- Locked down from the start (authenticated only, purge unreachable by any
-- API role) — same convention every RPC in this project follows.
revoke all on function public.update_note_entry(uuid, text, text) from public, anon;
revoke all on function public.delete_note_entry(uuid) from public, anon;
revoke all on function public.purge_deleted_note_entries() from public, anon, authenticated;
grant execute on function public.update_note_entry(uuid, text, text) to authenticated;
grant execute on function public.delete_note_entry(uuid) to authenticated;
