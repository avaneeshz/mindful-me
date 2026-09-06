-- Catalog Customization (see the full-stack-engineer agent definition's own
-- "Catalog Customization" section for the full architecture this and the
-- next three migrations implement together). The 9 tiles become real rows —
-- extendable to a user-added tile, exactly like `public.activities` already
-- is extendable to a user-added card. No multi-user support exists in this
-- product (confirmed in PRODUCT-HANDOFF.md) — one owner — but `created_by`
-- still mirrors `public.activities`' own established pattern (nullable =
-- system-seeded, set = user-added) rather than leaving this table with no
-- ownership concept at all: it is what the RLS policies below key off of,
-- and what a future multi-user product would already have in place.
create table public.catalog_categories (
  id text primary key,
  label text not null,
  icon_key text not null,
  sort_order int not null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.catalog_categories enable row level security;

-- Same shape as `public.activities`' own policies (Phase 2): the system
-- catalog (created_by null) is readable by any signed-in user, a user-added
-- tile only by the user who added it.
create policy "read system catalog and own tiles"
  on public.catalog_categories for select
  to authenticated
  using (created_by is null or created_by = (select auth.uid()));

create policy "create own tiles"
  on public.catalog_categories for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- No update/delete policy for a NORMAL (non-definer) caller — renaming an
-- existing tile is out of scope for v1 (the Configuration screen only adds
-- and soft-removes; see DECISIONS.md), and `is_active` toggling goes through
-- `set_catalog_category_active` (next migration after this one seeds the
-- table), a narrowly-scoped SECURITY DEFINER function — the one deliberate
-- exception to "RLS is the real enforcement boundary" this project already
-- carries for `encrypt_flags`/`decrypt_flags` (see `scheduling_api.sql`'s own
-- top comment) and `internal.encrypt_note_entry_text` (`note_entries.sql`).
-- It needs to reach a SYSTEM row (created_by null), which the "own row"
-- update policy this table would otherwise carry can never satisfy — this
-- product's single-owner reality (no multi-user isolation risk, confirmed
-- above) is what makes that narrow, ownership-blind toggle safe here.

-- Seed: the current 9 tiles (`data/activities.ts`'s `CATEGORY_ORDER`/
-- `CATEGORIES`), in their existing on-screen order — never hand-edit this
-- list, regenerate a new migration from `data/activities.ts` if it changes.
insert into public.catalog_categories (id, label, icon_key, sort_order) values
  ('sleep', 'Sleep & Rest', 'Moon', 0),
  ('food', 'Food & Nourishment', 'Utensils', 1),
  ('care', 'Personal Care', 'Droplet', 2),
  ('downtime', 'Downtime & Errands', 'Tv', 3),
  ('movement', 'Movement & Body Therapy', 'Footprints', 4),
  ('work', 'Work & Projects', 'Rocket', 5),
  ('nature', 'Nature & Spirit', 'Leaf', 6),
  ('growth', 'Growth & Connection', 'Sparkles', 7),
  ('home', 'Home & Chores', 'Home', 8);
