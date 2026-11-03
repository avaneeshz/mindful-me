-- Per-account State Tile customisation: a user's own name and picture for any
-- of the 18 built-in State Tiles (reflection cards). Only that user ever sees
-- them. A card with no row shows the built-in title and illustration.
--
-- The picture is the cropped 4:3 JPEG the browser produces (640x480, usually
-- 30-80 KB), stored as a data URL in the row, same approach and reasoning as
-- `custom_icons`: it rides the same RLS + RPC pattern and syncs to every
-- device with no signed-URL expiry.
--
-- Writes only go through the two RPCs below (no insert/update/delete policy)
-- so the limits can't be skipped. A row with neither a name nor a picture is
-- deleted, so "reset" leaves nothing behind.

create table public.reflection_card_overrides (
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_number smallint not null check (card_number between 1 and 18),
  name text check (name is null or (char_length(name) between 1 and 30 and name = btrim(name))),
  image_data text check (
    image_data is null
    or (image_data like 'data:image/jpeg;base64,%' and length(image_data) <= 200000)
  ),
  updated_at timestamptz not null default now(),
  primary key (created_by, card_number),
  check (name is not null or image_data is not null)
);

alter table public.reflection_card_overrides enable row level security;

create policy "read own reflection card overrides"
  on public.reflection_card_overrides for select
  to authenticated
  using (created_by = (select auth.uid()));

-- Sets (or, with null, clears) this user's name for one card.
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
  if p_card is null or p_card not between 1 and 18 then
    raise exception 'invalid_card' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 30 then
    raise exception 'name_too_long' using errcode = '22023';
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

-- Sets (or, with null, clears) this user's picture for one card.
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
  if p_card is null or p_card not between 1 and 18 then
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

revoke all on function public.set_reflection_card_name(smallint, text) from public, anon;
revoke all on function public.set_reflection_card_image(smallint, text) from public, anon;
grant execute on function public.set_reflection_card_name(smallint, text) to authenticated;
grant execute on function public.set_reflection_card_image(smallint, text) to authenticated;
