-- Editable names for Frame 1-4. One row per (user, frame); a missing row or a null
-- name means "use the default" ("Frame 1" ...). The name is a short personal label
-- like a tile label, so it is stored as plain text, not encrypted.
--
-- Deliberately NOT frame-scoped like the setup tables: every frame's name belongs
-- to the user and is readable and editable from any frame. Rows are owner-only.

create table public.frame_names (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  frame smallint not null check (frame between 1 and 4),
  name text check (name is null or char_length(btrim(name)) between 1 and 30),
  updated_at timestamptz not null default now(),
  primary key (user_id, frame)
);

alter table public.frame_names enable row level security;

create policy "read own frame names" on public.frame_names
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own frame names" on public.frame_names
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own frame names" on public.frame_names
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.frame_names from anon, public;
grant select, insert, update on public.frame_names to authenticated;
