-- State Tile notes: let the writer choose WHEN a note happened.
--
-- Same product rule as `20261123060000_note_entry_custom_time.sql`, for the notes
-- written on a State Tile itself (`reflection_card_notes`): by default the note is
-- stamped with the current time; the app lets the user pick another moment.
--
-- Expand-only (WORKFLOW.md): `create_reflection_card_note` is untouched, so a client
-- build that doesn't know this RPC keeps working. The new client calls v2 only when
-- the user picked a time.
--
-- The backend owns the rule: not more than 5 minutes ahead of now, not before 2000.
-- `updated_at` is set to the same moment as `created_at` so a back-dated note does
-- not read as "edited" (an edit moves `updated_at` to now()).

create or replace function public.create_reflection_card_note_v2(
  p_id uuid,
  p_card smallint,
  p_note text,
  p_created_at timestamptz default null
) returns public.reflection_card_note_dto
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_row public.reflection_card_notes;
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'id_required' using errcode = '22023';
  end if;
  if p_card is null or not internal.owns_reflection_card(p_card) then
    raise exception 'invalid_card' using errcode = '22023';
  end if;
  if v_note = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if char_length(v_note) > 10000 then
    raise exception 'note_too_long' using errcode = '22023';
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

  insert into public.reflection_card_notes (id, created_by, card_number, note_encrypted, created_at, updated_at)
  values (p_id, auth.uid(), p_card, internal.encrypt_note_entry_text(v_note), v_at, v_at)
  on conflict (id) do nothing;

  select * into v_row from public.reflection_card_notes where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  return (v_row.id, v_row.card_number, internal.decrypt_note_entry_text(v_row.note_encrypted), v_row.created_at, v_row.updated_at)::public.reflection_card_note_dto;
end;
$$;

revoke all on function public.create_reflection_card_note_v2(uuid, smallint, text, timestamptz) from public, anon;
grant execute on function public.create_reflection_card_note_v2(uuid, smallint, text, timestamptz) to authenticated;
