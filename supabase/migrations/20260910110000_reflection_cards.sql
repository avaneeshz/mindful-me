-- Reflection cards — the 18-topic grid `ReflectionSection.tsx` currently
-- renders as pure static UI mockup content (`data/reflectionCards.ts`), with
-- zero data model behind it. This is the catalog table: same `created_by`
-- nullable pattern `public.activities` already uses (null = system default,
-- visible to everyone; a set value = personal/custom content owned by that
-- user) — so a future "generic" default experience is just a different seed
-- of rows on the same schema, never a fork. The actual PAIRING of a card to
-- one specific logged activity (many-to-many, each pairing carrying its own
-- note) lives in `scheduled_activity_reflections`, a later migration in this
-- same series — this table is only the card definitions themselves.
--
-- `image_key` mirrors `activities.icon_key`'s own convention exactly: a
-- plain string identifier, not the image itself — the client already bundles
-- these 18 illustrations as static assets (`assets/reflection-cards/`) and
-- maps a key to the matching import, same as it already maps `icon_key` to a
-- Lucide component.
create table public.reflection_cards (
  id uuid primary key default gen_random_uuid(),
  number integer not null,
  title text not null,
  subtitle text not null,
  image_key text not null,
  created_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index reflection_cards_created_by_idx on public.reflection_cards (created_by) where created_by is not null;
-- The one real read path: "the cards available to me, in order" — scoped by
-- who can see them (system defaults + this user's own), ordered by `number`.
create index reflection_cards_number_idx on public.reflection_cards (number);

alter table public.reflection_cards enable row level security;

-- Rule 10's "no cross-user reads, ever" applies here exactly like it does for
-- `activities`: the system catalog (created_by null) is readable by any
-- signed-in user; a personal card is visible only to the user who made it.
create policy "read system catalog and own reflection cards"
  on public.reflection_cards for select
  to authenticated
  using (created_by is null or created_by = (select auth.uid()));

create policy "create own reflection cards"
  on public.reflection_cards for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "update own reflection cards"
  on public.reflection_cards for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "delete own reflection cards"
  on public.reflection_cards for delete
  to authenticated
  using (created_by = (select auth.uid()));
