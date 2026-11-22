-- Notes: let the writer choose WHEN a note happened.
--
-- A free-form note (header note button or State Tile note) has always been
-- stamped with the server clock at insert. The product now lets the user back-
-- date it: the app offers the current date and time by default, and a field to
-- change it. This adds the one RPC that accepts that moment.
--
-- Expand-only (WORKFLOW.md): `create_note_entry_v3` and everything older keep
-- their exact signature and behavior — a client build that doesn't know this
-- RPC (still live mid-deploy) keeps working, and the new client only calls v4
-- when the user actually picked a time. Nothing is renamed or dropped.
--
-- The backend owns the rule (CLAUDE.md, Platform Portability 4): a note can't
-- be dated in the future (5 minutes of slack for a slightly fast device clock)
-- or before 2000-01-01. The moment is a real instant (timestamptz, UTC); the
-- device's wall-clock reading of it is the client's concern.
--
-- `updated_at` is set equal to `created_at` on insert so a back-dated note does
-- not read as "edited" (`noteEntryWasEdited` compares the two).

create or replace function public.create_note_entry_v4(
  p_id uuid,
  p_button_key text,
  p_note text,
  p_entry_types text[] default null,
  p_created_at timestamptz default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_id uuid;
  v_types text[];
  v_is_tile boolean := internal.is_state_tile_note_key(p_button_key);
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_id is null then
    raise exception 'note_id_required' using errcode = '22023';
  end if;

  -- A retry of a save that already landed: hand back the existing row.
  select * into v_row from public.note_entries where id = p_id and user_id = auth.uid();
  if found then
    return public.to_note_entry_dto(v_row);
  end if;

  if p_created_at is not null then
    if p_created_at > now() + interval '5 minutes' then
      raise exception 'note_time_in_future' using errcode = '22023';
    end if;
    if p_created_at < timestamptz '2000-01-01 00:00:00+00' then
      raise exception 'note_time_too_old' using errcode = '22023';
    end if;
  end if;
  v_at := coalesce(p_created_at, now());

  if not v_is_tile then
    select id into v_button_id
    from public.header_buttons
    where category = 'notes' and key = p_button_key and created_by = auth.uid()
    limit 1;

    if v_button_id is null then
      raise exception 'invalid_button_key' using errcode = '22023';
    end if;
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  if not v_is_tile then
    v_types := internal.normalize_note_entry_types(v_button_id, p_entry_types);
  end if;

  insert into public.note_entries (id, user_id, button_key, note_encrypted, gift_type, gift_types, created_at, updated_at)
  values (p_id, auth.uid(), p_button_key, internal.encrypt_note_entry_text(p_note), v_types[1], v_types, v_at, v_at)
  on conflict (id) do nothing
  returning * into v_row;

  -- Lost a race with a concurrent identical call: return what it inserted.
  if v_row.id is null then
    select * into v_row from public.note_entries where id = p_id and user_id = auth.uid();
  end if;

  return public.to_note_entry_dto(v_row);
end;
$$;

revoke all on function public.create_note_entry_v4(uuid, text, text, text[], timestamptz) from public, anon;
grant execute on function public.create_note_entry_v4(uuid, text, text, text[], timestamptz) to authenticated;
