-- Phase 2: the activity catalog — today's `data/activities.ts` cards plus
-- their drill-down options, extendable to user-defined activities. One row
-- per level: a top-level card (parent_id null), a sub-option, or (for "Body
-- care" only) a third-level option — mirroring `ActivityCard.sub`/`.third`.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id text check (category_id in ('mind', 'body', 'sports', 'nature', 'focus')),
  parent_id uuid references public.activities (id) on delete cascade,
  icon_key text,
  -- System-seeded catalog entries have no owner; a user-defined activity
  -- (the extensibility the Target Architecture calls for) is scoped to the
  -- user who created it, never visible to anyone else.
  created_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Every top-level card names a category; a drill-down option inherits its
  -- category from its parent rather than repeating it.
  constraint top_level_has_category check (parent_id is not null or category_id is not null),
  unique (parent_id, name)
);

create index activities_parent_id_idx on public.activities (parent_id);
create index activities_created_by_idx on public.activities (created_by) where created_by is not null;

alter table public.activities enable row level security;

-- The system catalog (created_by is null) is readable by any signed-in
-- user; a user-defined activity is visible only to the user who made it —
-- rule 10's "no cross-user reads, ever" applies here too, not only to the
-- sensitive scheduling fields.
create policy "read system catalog and own activities"
  on public.activities for select
  to authenticated
  using (created_by is null or created_by = (select auth.uid()));

create policy "create own activities"
  on public.activities for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "update own activities"
  on public.activities for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "delete own activities"
  on public.activities for delete
  to authenticated
  using (created_by = (select auth.uid()));
