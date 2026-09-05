-- SCRUM-13: the 6 header pills (Gifts, Chits, Opportunities, Learnings,
-- Mirror, Prayer — Mirror renamed from Feedback, Prayer newly added on the
-- client) each get a note-entry surface: write a freeform note, Store it
-- with the current timestamp, and see the full history of previously stored
-- notes for that specific button. Gifts additionally carries a gift-type
-- selection from a fixed set of 5 values.
--
-- Deliberately a brand-new, standalone table — NOT a column/feature bolted
-- onto `scheduled_activities`/`activity_events`. This is not a scheduling
-- concern (Migration Phase 4/5 territory); it is its own append-only log,
-- one row per stored note, with no update/delete surface at all (nothing in
-- the ticket asks to edit or remove a stored note — only to add one and view
-- history — so, like `activity_events`, there is no update/delete RLS policy
-- and no RPC that would mutate an existing row).
--
-- Rule 10 — freeform notes are a "similarly sensitive field": encrypted at
-- rest, HTTPS only (Supabase's own transport, unrelated to this migration),
-- every query scoped to the authenticated user. This mirrors the existing
-- `scheduled_activities` pattern exactly: its own Vault secret, its own
-- `internal`-schema (never `public` — PostgREST doesn't expose that schema)
-- SECURITY DEFINER encrypt/decrypt pair. `button_key` and `gift_type` are
-- NOT sensitive (a closed, small enumeration, not personal content) and stay
-- plain columns with real CHECK constraints — encryption can't be
-- constraint-checked at the DB level (see the symptoms/quality migrations'
-- own comments on this), which is exactly why only the freeform note text
-- gets the encrypted treatment here.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'note_entries_text_key',
  'Symmetric key for encrypting note_entries.note_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'note_entries_text_key'
);

create function internal.encrypt_note_entry_text(note_text text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when note_text is null then null
    else extensions.pgp_sym_encrypt(
      note_text,
      (select decrypted_secret from vault.decrypted_secrets where name = 'note_entries_text_key')
    )
  end
$$;

create function internal.decrypt_note_entry_text(encrypted bytea)
returns text
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then null
    else extensions.pgp_sym_decrypt(
      encrypted,
      (select decrypted_secret from vault.decrypted_secrets where name = 'note_entries_text_key')
    )
  end
$$;

revoke all on function internal.encrypt_note_entry_text(text) from public, anon, authenticated;
revoke all on function internal.decrypt_note_entry_text(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_note_entry_text(text) to authenticated, service_role;
grant execute on function internal.decrypt_note_entry_text(bytea) to authenticated, service_role;

create table public.note_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- The 6 header pills this ticket wires up. Fixed enumeration, plain
  -- column (not sensitive content) — a real CHECK constraint, not merely
  -- validated in application code.
  button_key text not null check (
    button_key in ('gifts', 'chits', 'opportunities', 'learnings', 'mirror', 'prayer')
  ),

  -- Rule 10 — encrypted at rest. Never a plain `note text` column.
  note_encrypted bytea not null,

  -- Gifts-only: one of the 5 fixed gift types. Null for every other button.
  gift_type text check (
    gift_type is null or gift_type in ('Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier')
  ),
  constraint gift_type_only_for_gifts check (gift_type is null or button_key = 'gifts'),

  -- The timestamp requirement: "stored with the current timestamp". Never
  -- client-supplied — always the server's own clock at insert.
  created_at timestamptz not null default now()
);

-- The one read path this feature has: "show the complete history for a
-- button" — always scoped to one user's one button, newest first.
create index note_entries_user_button_idx
  on public.note_entries (user_id, button_key, created_at desc);

alter table public.note_entries enable row level security;

-- Rule 10 — every query scoped to the authenticated user, no cross-user
-- reads. Append-only by design: no update/delete policy, same as
-- `activity_events` — nothing in this ticket edits or removes a stored note,
-- only adds one and lists history.
create policy "read own note entries"
  on public.note_entries for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own note entries"
  on public.note_entries for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- The composite shape handed back to the client — the note already
-- decrypted, exactly like `scheduled_activity_dto` decrypts flags/quality/
-- symptoms/notes before it ever leaves the DB layer.
create type public.note_entry_dto as (
  id uuid,
  button_key text,
  note text,
  gift_type text,
  created_at timestamptz
);

create or replace function public.to_note_entry_dto(r public.note_entries)
returns public.note_entry_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(
    r.id, r.button_key, internal.decrypt_note_entry_text(r.note_encrypted), r.gift_type, r.created_at
  )::public.note_entry_dto
$$;

-- SECURITY INVOKER (the default) — runs as the calling user, so RLS above is
-- the real enforcement boundary. `internal.encrypt_note_entry_text` is the
-- one SECURITY DEFINER exception, scoped narrowly to resolving the Vault key.
create or replace function public.create_note_entry(
  p_button_key text,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Friendly errors ahead of the table's own CHECK constraints (belt and
  -- braces — same pattern `set_scheduled_activity_status` already uses for
  -- `status`).
  if p_button_key not in ('gifts', 'chits', 'opportunities', 'learnings', 'mirror', 'prayer') then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  if p_button_key = 'gifts' then
    if p_gift_type is null or p_gift_type not in ('Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier') then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  insert into public.note_entries (user_id, button_key, note_encrypted, gift_type)
  values (
    auth.uid(),
    p_button_key,
    internal.encrypt_note_entry_text(p_note),
    case when p_button_key = 'gifts' then p_gift_type else null end
  )
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

-- "Show the complete history for a button" — every stored note for one
-- button, newest first. The explicit `n.user_id = auth.uid()` filter below
-- is belt-and-braces on top of the select RLS policy above, exactly like
-- `list_scheduled_activities` filters `s.user_id = auth.uid()` in addition
-- to its own select policy. Unlike that function, this has no time-window
-- argument at all — rule 8 is about "today"/"this week" SCHEDULE reads
-- specifically, and the product requirement here is explicitly "the
-- complete history", so this is intentionally unbounded: one user's own
-- note log for one button is not the kind of unbounded growth rule 8 was
-- written to guard against.
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
  order by n.created_at desc;
$$;

-- Grants: locked down from the start (authenticated only), same convention
-- every other RPC in this project already reached.
revoke all on function public.create_note_entry(text, text, text) from public, anon;
revoke all on function public.list_note_entries(text) from public, anon;
grant execute on function public.create_note_entry(text, text, text) to authenticated;
grant execute on function public.list_note_entries(text) to authenticated;
