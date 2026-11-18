-- Deleting a State Tile hides it; it can be restored from Settings → Hidden
-- items. The hidden set is per account: one row holding the card numbers the
-- user has hidden. Nothing about the tile itself changes — its notes, name,
-- picture and place in the order are all kept, so Restore puts it back exactly
-- where it was.
--
-- Reads are direct (own row, RLS); writes only go through the RPC, which checks
-- the card is a built-in tile or one of the caller's own custom tiles.

create table public.reflection_card_hidden (
  created_by uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  hidden_cards smallint[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (cardinality(hidden_cards) <= 518)
);

alter table public.reflection_card_hidden enable row level security;

create policy "read own reflection card hidden"
  on public.reflection_card_hidden for select
  to authenticated
  using (created_by = (select auth.uid()));

create or replace function public.set_reflection_card_hidden(p_card smallint, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_card is null or p_hidden is null or not internal.owns_reflection_card(p_card) then
    raise exception 'invalid_card' using errcode = '22023';
  end if;

  insert into public.reflection_card_hidden as r (created_by, hidden_cards)
  values (auth.uid(), case when p_hidden then array[p_card] else '{}'::smallint[] end)
  on conflict (created_by) do update
    set hidden_cards = case
          when p_hidden then (select coalesce(array_agg(distinct c order by c), '{}') from unnest(array_append(r.hidden_cards, p_card)) as c)
          else array_remove(r.hidden_cards, p_card)
        end,
        updated_at = now();
end;
$$;

revoke all on function public.set_reflection_card_hidden(smallint, boolean) from public, anon;
grant execute on function public.set_reflection_card_hidden(smallint, boolean) to authenticated;
