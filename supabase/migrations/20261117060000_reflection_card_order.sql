-- Per-account order of the 18 State Tiles. One row per user holding the whole
-- order as an array of card numbers (a permutation of 1..18), so a reorder is
-- one atomic write and can never leave two tiles in the same slot. A user with
-- no row sees the built-in order.
--
-- Reads are direct (own row only, RLS); writes only go through the RPC, which
-- checks the array really is a permutation of 1..18.

create table public.reflection_card_order (
  created_by uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  card_order smallint[] not null,
  updated_at timestamptz not null default now(),
  check (cardinality(card_order) = 18)
);

alter table public.reflection_card_order enable row level security;

create policy "read own reflection card order"
  on public.reflection_card_order for select
  to authenticated
  using (created_by = (select auth.uid()));

create or replace function public.set_reflection_card_order(p_order smallint[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_order is null
     or cardinality(p_order) <> 18
     or (select count(distinct c) from unnest(p_order) as c where c between 1 and 18) <> 18 then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  insert into public.reflection_card_order (created_by, card_order)
  values (auth.uid(), p_order)
  on conflict (created_by)
  do update set card_order = excluded.card_order, updated_at = now();
end;
$$;

revoke all on function public.set_reflection_card_order(smallint[]) from public, anon;
grant execute on function public.set_reflection_card_order(smallint[]) to authenticated;
