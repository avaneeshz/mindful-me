-- ===========================================================================
-- Raise the custom State Tile cap from 50 to the numbering ceiling.
--
-- Custom tiles are numbered 19 upward per (account, frame) and every tile
-- number must stay inside 1..500 (check constraints on the tile tables, the
-- `tile<n>_` note-button keys). 499 and 500 are reserved for the Dashboard and
-- Product Page (20261125060000_button_page_scopes.sql), so the highest number a
-- custom tile may take is 498 — room for 480 tiles per frame.
--
-- Only the `create_reflection_custom_card` body changes: the "50 tiles" count
-- check becomes a "next number must be <= 498" check, raising the same
-- `too_many_cards` error. Signature, grants and every other rule are unchanged,
-- so an older client (which still enforces 50 on its own) keeps working.
-- ===========================================================================

create or replace function public.create_reflection_custom_card(
  p_name text,
  p_image_data text default null
) returns smallint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_next smallint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if char_length(v_name) > 30 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if p_image_data is not null and p_image_data not like 'data:image/jpeg;base64,%' then
    raise exception 'invalid_image_format' using errcode = '22023';
  end if;
  if p_image_data is not null and length(p_image_data) > 200000 then
    raise exception 'image_too_large' using errcode = '22023';
  end if;

  -- Serialise this user's allocations so two tabs can't claim the same number.
  perform pg_advisory_xact_lock(hashtextextended('reflection_custom_card:' || auth.uid()::text || ':' || internal.current_frame()::text, 0));

  select coalesce(max(card_number), 18) + 1 into v_next
  from public.reflection_custom_cards where created_by = auth.uid() and frame = internal.current_frame();
  if v_next > 498 then
    raise exception 'too_many_cards' using errcode = '22023';
  end if;

  insert into public.reflection_custom_cards (created_by, card_number) values (auth.uid(), v_next);
  insert into public.reflection_card_overrides (created_by, card_number, name, image_data)
  values (auth.uid(), v_next, v_name, p_image_data);

  -- A saved order gets the new tile at its end; with no saved order the built-in
  -- order plus custom tiles ascending is already what the app shows.
  update public.reflection_card_order set card_order = card_order || v_next, updated_at = now()
   where created_by = auth.uid() and frame = internal.current_frame();

  return v_next;
end;
$$;
