-- Notes: make "save a note" safe to retry.
--
-- Until now `create_note_entry_v2` always minted a new row. The app retries a
-- save whose reply it never saw (offline, a dropped connection, a slow
-- response) — so a save that HAD reached the server could be sent again and
-- land twice: a duplicated note. Every other create RPC in this schema already
-- takes a client-supplied id for exactly this reason (create_activity,
-- create_tile, create_parameter_option, ...).
--
-- Expand-only (WORKFLOW.md): `create_note_entry_v2` and everything older keep
-- their exact signature and behavior, so a client build that doesn't know this
-- RPC (still live mid-deploy) keeps working. Nothing is renamed or dropped.
--
-- `create_note_entry_v3(p_id, ...)` is idempotent on `p_id` for the calling
-- user: the first call inserts; any repeat returns the row that is already
-- there (even if it has since been soft-deleted — a retry must not resurrect
-- or duplicate it) and changes nothing.

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

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = p_button_key and created_by = auth.uid()
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  v_types := internal.normalize_note_entry_types(v_button_id, p_entry_types);

  insert into public.note_entries (id, user_id, button_key, note_encrypted, gift_type, gift_types)
  values (p_id, auth.uid(), p_button_key, internal.encrypt_note_entry_text(p_note), v_types[1], v_types)
  on conflict (id) do nothing
  returning * into v_row;

  -- Lost a race with a concurrent identical call: return what it inserted.
  if v_row.id is null then
    select * into v_row from public.note_entries where id = p_id and user_id = auth.uid();
  end if;

  return public.to_note_entry_dto(v_row);
end;
$$;

revoke all on function public.create_note_entry_v3(uuid, text, text, text[]) from public, anon;
grant execute on function public.create_note_entry_v3(uuid, text, text, text[]) to authenticated;
