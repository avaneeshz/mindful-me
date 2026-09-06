-- Catalog Customization, part 2: `public.activities` already correctly
-- models card -> sub -> third via `parent_id` (Phase 2) — reused as-is for
-- all three levels, no new tree table needed. This migration only adds what
-- the Configuration screen needs on top: an explicit on-screen order per
-- sibling group, a soft-disable flag (rule 11's spirit — recoverable,
-- FK-safe, never a hard delete of a row that ever reached the server), and a
-- real foreign key to `catalog_categories` in place of the old fixed
-- 9-value enum check constraint (itself only ever a stand-in until the
-- tiles became real rows).
alter table public.activities
  add column sort_order int,
  add column is_active boolean not null default true;

-- Backfill: each row's position within its own sibling group (top-level
-- cards grouped by `category_id`, a sub/third grouped by `parent_id`),
-- ordered by `created_at` — the same order the seed migrations always
-- inserted rows in, so this reproduces `data/activities.ts`'s existing
-- on-screen order exactly for every pre-existing row. `id` breaks a tie for
-- any two rows created in the same instant (belt and braces — every existing
-- seed migration's rows are inserted sequentially, so real ties are not
-- expected in practice).
with ordered as (
  select id, row_number() over (
    partition by coalesce(parent_id::text, category_id)
    order by created_at, id
  ) - 1 as rn
  from public.activities
)
update public.activities a
set sort_order = ordered.rn
from ordered
where a.id = ordered.id;

alter table public.activities alter column sort_order set not null;
alter table public.activities alter column sort_order set default 0;

-- The old fixed 9-value enum becomes a real FK — `catalog_categories` is
-- seeded (previous migration) with exactly those 9 ids before this runs, so
-- every existing `category_id` value already satisfies it.
alter table public.activities drop constraint activities_category_id_check;

alter table public.activities
  add constraint activities_category_id_fkey
  foreign key (category_id) references public.catalog_categories (id);

-- No update/delete policy is added for a normal (non-definer) caller here —
-- see `catalog_categories.sql`'s own comment on why `is_active` toggling
-- goes through a narrowly-scoped SECURITY DEFINER function instead (needed
-- to soft-disable a SYSTEM row, which the existing "own row" update policy on
-- this table can never satisfy). The existing "own activities" update policy
-- (Phase 2) still governs any OTHER column a user might one day edit on their
-- own rows; it is untouched by this migration.
