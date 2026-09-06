-- Catalog Customization, part 3: per-activity allow-list overrides for the
-- three master vocabularies (Activity Quality/Chronic Symptom/Protective
-- Response — `QUALITIES`/`SYMPTOMS`/`FLAGS` in `data/activities.ts`, which
-- stay fixed TS constants, never user-editable themselves; only which subset
-- applies to a given activity is data-driven, per the architecture). Scope is
-- deliberately per ACTIVITY (the top-level card, e.g. "Supplements"), never
-- per tile — two cards in the same tile can restrict their own quality/
-- symptom/flag options completely differently.
--
-- NO ROWS for an (activity_id, attribute_type) pair means "show the full
-- master list" — today's behaviour for all 53 existing items, reproduced
-- with zero migration risk (nothing needs seeding here at all). Only an
-- explicit row set restricts it.
create table public.activity_attribute_options (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Rule 10 — every query scoped to the authenticated user, no cross-user
  -- reads. Unlike `catalog_categories`/`activities` (system rows are shared,
  -- readable by anyone signed in), an attribute-option override is never a
  -- "system default" concept — it is always one user's own restriction of
  -- their own log form, so `user_id` is NOT NULL here (no system-row case).
  user_id uuid not null references auth.users (id) on delete cascade,
  attribute_type text not null check (attribute_type in ('quality', 'symptom', 'flag')),
  -- Plain text, not an enum/FK: the master vocabularies live only as TS
  -- constants (`QUALITIES`/`SYMPTOMS`/`FLAGS`), never mirrored into the
  -- database — validating an id against them is the client/RPC's job, not a
  -- DB constraint here, so as not to duplicate that vocabulary in two places.
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (activity_id, attribute_type, option_id)
);

create index activity_attribute_options_lookup_idx
  on public.activity_attribute_options (activity_id, attribute_type);

alter table public.activity_attribute_options enable row level security;

create policy "read own attribute option overrides"
  on public.activity_attribute_options for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "create own attribute option overrides"
  on public.activity_attribute_options for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "delete own attribute option overrides"
  on public.activity_attribute_options for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- No update policy: `set_activity_attribute_options` (next migration)
-- replaces a pair's whole allow-list via delete-then-insert, never an
-- in-place row edit.
