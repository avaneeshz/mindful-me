-- Uploaded icons for tiles and activities (#15).
--
-- A user can upload their own icon instead of picking a built-in Lucide one.
-- The browser checks the file (PNG or SVG, square, at least 128x128, at most
-- 200 KB), removes a plain background, turns it into a single-colour
-- silhouette and shows a preview; only once the user approves is the result
-- stored here, as a small 128x128 PNG data URL. The app renders it as a mask
-- filled with the theme's ink colour, so it matches the monochrome UI in
-- light and dark mode.
--
-- Stored in a plain table rather than Storage: the processed PNG is a few
-- KB, it rides the same RLS + RPC pattern as every other user-owned row, and
-- it syncs to every device the user signs in on with no signed-URL expiry.
--
-- A tile or activity points at an uploaded icon with icon_key
-- 'custom:<custom_icons.id>'. The trigger below makes sure that id exists
-- and belongs to the same user, and `delete_custom_icon` refuses to delete
-- an icon that is still in use.

create table public.custom_icons (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_data text not null
    check (image_data like 'data:image/png;base64,%' and length(image_data) <= 120000),
  created_at timestamptz not null default now()
);

create index custom_icons_created_by_idx on public.custom_icons (created_by);

alter table public.custom_icons enable row level security;

create policy "read own custom icons"
  on public.custom_icons for select
  to authenticated
  using (created_by = (select auth.uid()));

-- Inserts only go through `create_custom_icon` (no insert/update policy), so
-- the 200-icon limit can't be skipped. It is security definer for that
-- reason and always writes `created_by = auth.uid()`.
create or replace function public.create_custom_icon(
  p_id uuid,
  p_image_data text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'id_required' using errcode = '22023';
  end if;
  if p_image_data is null or p_image_data not like 'data:image/png;base64,%' then
    raise exception 'invalid_icon_format' using errcode = '22023';
  end if;
  if length(p_image_data) > 120000 then
    raise exception 'icon_too_large' using errcode = '22023';
  end if;

  select count(*) into v_count from public.custom_icons where created_by = auth.uid();
  if v_count >= 200 then
    raise exception 'icon_limit_reached' using errcode = '22023';
  end if;

  insert into public.custom_icons (id, created_by, image_data)
  values (p_id, auth.uid(), p_image_data);

  return p_id;
end;
$$;

revoke all on function public.create_custom_icon(uuid, text) from public, anon;
grant execute on function public.create_custom_icon(uuid, text) to authenticated;

-- Lets `delete_custom_icon` (security invoker) remove the caller's own row.
create policy "delete own unused custom icons via rpc"
  on public.custom_icons for delete
  to authenticated
  using (created_by = (select auth.uid()));

create or replace function public.delete_custom_icon(p_id uuid) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_key text := 'custom:' || p_id::text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.tiles where created_by = auth.uid() and icon_key = v_key)
     or exists (select 1 from public.activities where created_by = auth.uid() and icon_key = v_key) then
    raise exception 'icon_in_use' using errcode = '23503';
  end if;

  delete from public.custom_icons where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'icon_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_custom_icon(uuid) from public, anon;
grant execute on function public.delete_custom_icon(uuid) to authenticated;

-- A 'custom:<uuid>' icon_key must name one of the row owner's own icons.
create or replace function internal.assert_custom_icon_owned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if new.icon_key is null or new.icon_key not like 'custom:%' then
    return new;
  end if;
  begin
    v_id := substring(new.icon_key from 8)::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_custom_icon' using errcode = '22023';
  end;
  if new.created_by is null
     or not exists (select 1 from public.custom_icons where id = v_id and created_by = new.created_by) then
    raise exception 'invalid_custom_icon' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function internal.assert_custom_icon_owned() from public, anon, authenticated;

create trigger tiles_assert_custom_icon_owned
  before insert or update of icon_key on public.tiles
  for each row execute function internal.assert_custom_icon_owned();

create trigger activities_assert_custom_icon_owned
  before insert or update of icon_key on public.activities
  for each row execute function internal.assert_custom_icon_owned();
