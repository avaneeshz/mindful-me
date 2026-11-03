-- Notes written on a State Tile (reflection card): a dated history per card,
-- per account. Tapping a tile shows the notes written on it before, newest
-- first, and lets the user add a note or edit an earlier one. A note is not
-- tied to any activity.
--
-- Rule 10: free-form personal writing, so the text is encrypted at rest with
-- the same Vault key and helper functions as `note_entries`. The table has
-- RLS on and NO policies, so no client can read or write it directly; every
-- access goes through the SECURITY DEFINER functions below, which always
-- scope to `auth.uid()` and hand back decrypted text only to its owner.
--
-- `created_at` / `updated_at` are the server's clock (UTC); the client shows
-- them in the viewer's own time zone. An edit keeps the original
-- `created_at` and moves `updated_at`, so the history shows when a note was
-- written and that it was edited.

create table public.reflection_card_notes (
  id uuid primary key,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_number smallint not null check (card_number between 1 and 18),
  note_encrypted bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reflection_card_notes_owner_card_idx
  on public.reflection_card_notes (created_by, card_number, created_at desc);

alter table public.reflection_card_notes enable row level security;
revoke all on public.reflection_card_notes from anon, authenticated;

create type public.reflection_card_note_dto as (
  id uuid,
  card_number smallint,
  note text,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function public.list_reflection_card_notes(p_card smallint)
returns setof public.reflection_card_note_dto
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.card_number, internal.decrypt_note_entry_text(n.note_encrypted), n.created_at, n.updated_at
  from public.reflection_card_notes n
  where n.created_by = auth.uid() and n.card_number = p_card
  order by n.created_at desc;
$$;

-- `p_id` is minted on the device so a retry after a lost reply returns the
-- existing note instead of adding a second one.
create or replace function public.create_reflection_card_note(
  p_id uuid,
  p_card smallint,
  p_note text
) returns public.reflection_card_note_dto
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_row public.reflection_card_notes;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'id_required' using errcode = '22023';
  end if;
  if p_card is null or p_card not between 1 and 18 then
    raise exception 'invalid_card' using errcode = '22023';
  end if;
  if v_note = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if char_length(v_note) > 10000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  insert into public.reflection_card_notes (id, created_by, card_number, note_encrypted)
  values (p_id, auth.uid(), p_card, internal.encrypt_note_entry_text(v_note))
  on conflict (id) do nothing;

  select * into v_row from public.reflection_card_notes where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  return (v_row.id, v_row.card_number, internal.decrypt_note_entry_text(v_row.note_encrypted), v_row.created_at, v_row.updated_at)::public.reflection_card_note_dto;
end;
$$;

create or replace function public.update_reflection_card_note(
  p_id uuid,
  p_note text
) returns public.reflection_card_note_dto
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_row public.reflection_card_notes;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_note = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if char_length(v_note) > 10000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  update public.reflection_card_notes
     set note_encrypted = internal.encrypt_note_entry_text(v_note), updated_at = now()
   where id = p_id and created_by = auth.uid()
  returning * into v_row;
  if not found then
    raise exception 'note_not_found' using errcode = 'P0002';
  end if;

  return (v_row.id, v_row.card_number, internal.decrypt_note_entry_text(v_row.note_encrypted), v_row.created_at, v_row.updated_at)::public.reflection_card_note_dto;
end;
$$;

revoke all on function public.list_reflection_card_notes(smallint) from public, anon;
revoke all on function public.create_reflection_card_note(uuid, smallint, text) from public, anon;
revoke all on function public.update_reflection_card_note(uuid, text) from public, anon;
grant execute on function public.list_reflection_card_notes(smallint) to authenticated;
grant execute on function public.create_reflection_card_note(uuid, smallint, text) to authenticated;
grant execute on function public.update_reflection_card_note(uuid, text) to authenticated;
