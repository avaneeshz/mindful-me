-- Free-form notes on a State Tile, stored exactly like the header note buttons.
--
-- The "Decisions" State Tile (card 9) opens a full-screen window whose notes are
-- the same thing as a header free-form note button's: rows in
-- `public.note_entries` (encrypted text, soft delete, 30-day recovery, edit
-- history), written through the same RPCs (`create_note_entry_v3`,
-- `update_note_entry_v2`, `delete_note_entry`, `list_note_entries`). That is what
-- lets a header note button's notes be moved onto the tile later by simply
-- re-keying rows — no format conversion.
--
-- The one thing that has to change: those RPCs and the `validate_note_entry`
-- trigger only accept a `button_key` that matches the caller's own
-- `header_buttons` 'notes' row. A tile has no header button, so a RESERVED key
-- shape — `state_tile_<1..18>` — is also accepted. It has no type vocabulary
-- (types stay a header-button concept), so `p_entry_types` is ignored for it.
-- A user cannot create a header button with that key, so the two namespaces
-- cannot collide (`header_buttons.key` is validated separately; see the guard
-- below).
--
-- Expand-only (WORKFLOW.md): signatures and behavior for every existing key are
-- unchanged; nothing is renamed or dropped.

create or replace function internal.is_state_tile_note_key(p_key text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_key ~ '^state_tile_([1-9]|1[0-8])$', false)
$$;

grant execute on function internal.is_state_tile_note_key(text) to authenticated, service_role;

-- A header button may never take a reserved tile key.
alter table public.header_buttons
  add constraint header_buttons_key_not_state_tile
  check (key is null or not internal.is_state_tile_note_key(key)) not valid;

create or replace function public.validate_note_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_button_id uuid;
  v_type_count integer;
begin
  if internal.is_state_tile_note_key(new.button_key) then
    if new.gift_type is not null or new.gift_types is not null then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    return new;
  end if;

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = new.button_key and created_by = new.user_id
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if new.gift_type is not null then
    if v_type_count = 0 then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = new.gift_type
    ) then
      raise exception 'invalid_gift_type' using errcode = '22023';
    end if;
  end if;

  if new.gift_types is not null then
    if v_type_count = 0 then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(new.gift_types) as t
      where not exists (
        select 1 from public.header_button_note_types nt where nt.header_button_id = v_button_id and nt.value = t
      )
    ) then
      raise exception 'invalid_gift_type' using errcode = '22023';
    end if;
    if new.gift_type is distinct from new.gift_types[1] then
      raise exception 'gift_type_mismatch' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_note_entry_v3(
  p_id uuid,
  p_button_key text,
  p_note text,
  p_entry_types text[] default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_id uuid;
  v_types text[];
  v_is_tile boolean := internal.is_state_tile_note_key(p_button_key);
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

  insert into public.note_entries (id, user_id, button_key, note_encrypted, gift_type, gift_types)
  values (p_id, auth.uid(), p_button_key, internal.encrypt_note_entry_text(p_note), v_types[1], v_types)
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.note_entries where id = p_id and user_id = auth.uid();
  end if;

  return public.to_note_entry_dto(v_row);
end;
$$;

create or replace function public.update_note_entry_v2(
  p_id uuid,
  p_note text,
  p_entry_types text[] default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_key text;
  v_button_id uuid;
  v_types text[];
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

  if not internal.is_state_tile_note_key(v_button_key) then
    select id into v_button_id
    from public.header_buttons
    where category = 'notes' and key = v_button_key and created_by = auth.uid()
    limit 1;

    v_types := internal.normalize_note_entry_types(v_button_id, p_entry_types);
  end if;

  update public.note_entries
  set note_encrypted = internal.encrypt_note_entry_text(p_note),
      gift_type = v_types[1],
      gift_types = v_types
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

revoke all on function public.create_note_entry_v3(uuid, text, text, text[]) from public, anon;
grant execute on function public.create_note_entry_v3(uuid, text, text, text[]) to authenticated;
revoke all on function public.update_note_entry_v2(uuid, text, text[]) from public, anon;
grant execute on function public.update_note_entry_v2(uuid, text, text[]) to authenticated;
