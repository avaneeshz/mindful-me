-- Custom State Tiles: a user can add their own tiles beyond the 18 built-in
-- ones, with their own name and picture. A custom tile is just another card
-- NUMBER (19 and up, allocated per user), so everything already keyed by card
-- number keeps working unchanged: the tile's notes (`reflection_card_notes`),
-- its name and picture (`reflection_card_overrides`) and its place in the grid
-- (`reflection_card_order`).
--
-- Custom tiles are not mappable to activities (that mapping is tied to the 18
-- built-in `reflection_cards` rows) — they hold notes, a name, a picture and a
-- position, which is all the tile grid does.
--
-- Ownership: a custom number is only valid for the user it was allocated to.
-- Every write checks `internal.owns_reflection_card`, so one user can never
-- write notes, names or pictures onto another user's tile number.

create table public.reflection_custom_cards (
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_number smallint not null check (card_number between 19 and 500),
  created_at timestamptz not null default now(),
  primary key (created_by, card_number)
);

alter table public.reflection_custom_cards enable row level security;

create policy "read own reflection custom cards"
  on public.reflection_custom_cards for select
  to authenticated
  using (created_by = (select auth.uid()));

-- True for a built-in tile (1..18) and for a custom tile the caller owns.
create or replace function internal.owns_reflection_card(p_card smallint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    p_card between 1 and 18
    or exists (select 1 from public.reflection_custom_cards c where c.created_by = auth.uid() and c.card_number = p_card),
    false)
$$;

revoke all on function internal.owns_reflection_card(smallint) from public, anon;
grant execute on function internal.owns_reflection_card(smallint) to authenticated;

-- --- Let the existing tables hold custom numbers ------------------------------

alter table public.reflection_card_overrides drop constraint reflection_card_overrides_card_number_check;
alter table public.reflection_card_overrides add constraint reflection_card_overrides_card_number_check check (card_number between 1 and 500);

alter table public.reflection_card_notes drop constraint reflection_card_notes_card_number_check;
alter table public.reflection_card_notes add constraint reflection_card_notes_card_number_check check (card_number between 1 and 500);

alter table public.reflection_card_order drop constraint reflection_card_order_card_order_check;
alter table public.reflection_card_order add constraint reflection_card_order_card_order_check check (cardinality(card_order) between 18 and 518);

-- --- Writes check ownership instead of "1..18" --------------------------------

create or replace function public.set_reflection_card_name(
  p_card smallint,
  p_name text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_card is null or not internal.owns_reflection_card(p_card) then
    raise exception 'invalid_card' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 30 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  -- A custom tile has no built-in title to fall back to, so it always keeps a name.
  if v_name is null and p_card > 18 then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if v_name is null then
    update public.reflection_card_overrides
       set name = null, updated_at = now()
     where created_by = auth.uid() and card_number = p_card;
    delete from public.reflection_card_overrides
     where created_by = auth.uid() and card_number = p_card and image_data is null;
  else
    insert into public.reflection_card_overrides (created_by, card_number, name)
    values (auth.uid(), p_card, v_name)
    on conflict (created_by, card_number)
    do update set name = excluded.name, updated_at = now();
  end if;
end;
$$;

create or replace function public.set_reflection_card_image(
  p_card smallint,
  p_image_data text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_card is null or not internal.owns_reflection_card(p_card) then
    raise exception 'invalid_card' using errcode = '22023';
  end if;
  if p_image_data is not null and p_image_data not like 'data:image/jpeg;base64,%' then
    raise exception 'invalid_image_format' using errcode = '22023';
  end if;
  if p_image_data is not null and length(p_image_data) > 200000 then
    raise exception 'image_too_large' using errcode = '22023';
  end if;

  if p_image_data is null then
    update public.reflection_card_overrides
       set image_data = null, updated_at = now()
     where created_by = auth.uid() and card_number = p_card;
    delete from public.reflection_card_overrides
     where created_by = auth.uid() and card_number = p_card and name is null;
  else
    insert into public.reflection_card_overrides (created_by, card_number, image_data)
    values (auth.uid(), p_card, p_image_data)
    on conflict (created_by, card_number)
    do update set image_data = excluded.image_data, updated_at = now();
  end if;
end;
$$;

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
  if p_card is null or not internal.owns_reflection_card(p_card) then
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

-- The order must be exactly the built-in tiles plus this user's custom ones.
create or replace function public.set_reflection_card_order(p_order smallint[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select 18 + count(*) into v_expected from public.reflection_custom_cards where created_by = auth.uid();
  if p_order is null
     or cardinality(p_order) <> v_expected
     or (select count(distinct c) from unnest(p_order) as c where internal.owns_reflection_card(c)) <> v_expected then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  insert into public.reflection_card_order (created_by, card_order)
  values (auth.uid(), p_order)
  on conflict (created_by)
  do update set card_order = excluded.card_order, updated_at = now();
end;
$$;

-- --- Adding a tile --------------------------------------------------------------

-- Allocates the caller's next custom tile number, stores its name (required)
-- and picture (optional) and puts it at the end of their order. Returns the
-- number. Capped so the grid and the order array stay a sensible size.
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
  v_count int;
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
  perform pg_advisory_xact_lock(hashtextextended('reflection_custom_card:' || auth.uid()::text, 0));

  select count(*), coalesce(max(card_number), 18) + 1 into v_count, v_next
  from public.reflection_custom_cards where created_by = auth.uid();
  if v_count >= 50 then
    raise exception 'too_many_cards' using errcode = '22023';
  end if;

  insert into public.reflection_custom_cards (created_by, card_number) values (auth.uid(), v_next);
  insert into public.reflection_card_overrides (created_by, card_number, name, image_data)
  values (auth.uid(), v_next, v_name, p_image_data);

  -- A saved order gets the new tile at its end; with no saved order the built-in
  -- order plus custom tiles ascending is already what the app shows.
  update public.reflection_card_order set card_order = card_order || v_next, updated_at = now()
   where created_by = auth.uid();

  return v_next;
end;
$$;

revoke all on function public.create_reflection_custom_card(text, text) from public, anon;
grant execute on function public.create_reflection_custom_card(text, text) to authenticated;
