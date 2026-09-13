-- New header control: Supplements. A fixed 7-item daily checklist (Zinc,
-- Omega, Magnesium, 3 Ayurveda items, MultiVitamin) — genuinely a new
-- interaction pattern (see the full-stack-engineer agent definition's own
-- Component Rule analysis: this is neither `note_entries`' append-only log
-- nor a single per-day set/replace value, but N independently-toggleable
-- daily items, each with its own optional note).
--
-- Confirmed requirement: resets daily — every viewed day starts with all 7
-- unchecked, and marking one done logs a real per-day, per-supplement
-- completion record (not a single persistent checklist state). This table
-- is that record: one row per (user, item, calendar day) that EXISTS once
-- the user has ever interacted with that item on that day (checked it,
-- unchecked it, or just added a note) — a day with no rows for an item
-- simply renders unchecked, which is what "resets daily" means in practice
-- (nothing to reset — the absence of a row IS the reset state). `done` is a
-- real column (not "row exists = done") specifically so unchecking preserves
-- any note already typed, rather than losing it the moment the box is
-- unticked.
--
-- Rule 12 — editing a past day is always allowed: `local_date` is
-- client-supplied per call, exactly like `scheduled_activities.local_date`,
-- so this works for whichever day the header's own date picker has
-- `viewedDate` pointed at, not only "today".
--
-- Rule 10 — the per-item note is a "similarly sensitive field": its own
-- Vault secret, its own `internal`-schema SECURITY DEFINER encrypt/decrypt
-- pair, mirroring `note_entries.note_encrypted` exactly. `item_key` is NOT
-- sensitive (a closed, small, fixed enumeration) and stays a plain column
-- with a real CHECK constraint.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'supplement_completions_note_key',
  'Symmetric key for encrypting supplement_completions.note_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'supplement_completions_note_key'
);

create function internal.encrypt_supplement_note(note_text text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when note_text is null or note_text = '' then null
    else extensions.pgp_sym_encrypt(
      note_text,
      (select decrypted_secret from vault.decrypted_secrets where name = 'supplement_completions_note_key')
    )
  end
$$;

create function internal.decrypt_supplement_note(encrypted bytea)
returns text
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then null
    else extensions.pgp_sym_decrypt(
      encrypted,
      (select decrypted_secret from vault.decrypted_secrets where name = 'supplement_completions_note_key')
    )
  end
$$;

revoke all on function internal.encrypt_supplement_note(text) from public, anon, authenticated;
revoke all on function internal.decrypt_supplement_note(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_supplement_note(text) to authenticated, service_role;
grant execute on function internal.decrypt_supplement_note(bytea) to authenticated, service_role;

create table public.supplement_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null check (
    item_key in (
      'zinc', 'omega', 'magnesium',
      'ayurveda_skin', 'ayurveda_fibroid', 'ayurveda_varicose',
      'multivitamin'
    )
  ),
  local_date date not null,
  done boolean not null default false,
  note_encrypted bytea,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_key, local_date)
);

-- Rule 8 — the one read path this feature has ("this day's checklist") is
-- always scoped to one user + one day.
create index supplement_completions_user_date_idx
  on public.supplement_completions (user_id, local_date);

create or replace function public.set_supplement_completions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger supplement_completions_set_updated_at
  before update on public.supplement_completions
  for each row execute function public.set_supplement_completions_updated_at();

alter table public.supplement_completions enable row level security;

create policy "read own supplement completions"
  on public.supplement_completions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own supplement completions"
  on public.supplement_completions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own supplement completions"
  on public.supplement_completions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create type public.supplement_completion_dto as (
  item_key text,
  local_date date,
  done boolean,
  note text,
  completed_at timestamptz,
  updated_at timestamptz
);

create or replace function public.to_supplement_completion_dto(r public.supplement_completions)
returns public.supplement_completion_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(
    r.item_key, r.local_date, r.done,
    internal.decrypt_supplement_note(r.note_encrypted),
    r.completed_at, r.updated_at
  )::public.supplement_completion_dto
$$;

-- One item's state for one day — upserted as a whole (done + note together,
-- same "caller sends the authoritative full value" contract every bundled
-- field in this project already follows). Toggling done true stamps
-- `completed_at`; toggling back off clears it but keeps any note, so
-- unchecking never loses what was typed.
create or replace function public.set_supplement_completion(
  p_item_key text,
  p_local_date date,
  p_done boolean,
  p_note text default null
) returns public.supplement_completion_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.supplement_completions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_item_key not in (
    'zinc', 'omega', 'magnesium',
    'ayurveda_skin', 'ayurveda_fibroid', 'ayurveda_varicose',
    'multivitamin'
  ) then
    raise exception 'invalid_item_key' using errcode = '22023';
  end if;

  insert into public.supplement_completions (user_id, item_key, local_date, done, note_encrypted, completed_at)
  values (
    auth.uid(), p_item_key, p_local_date, coalesce(p_done, false),
    internal.encrypt_supplement_note(p_note),
    case when coalesce(p_done, false) then now() else null end
  )
  on conflict (user_id, item_key, local_date) do update set
    done = excluded.done,
    note_encrypted = excluded.note_encrypted,
    completed_at = case when excluded.done then coalesce(public.supplement_completions.completed_at, now()) else null end
  where public.supplement_completions.user_id = auth.uid()
  returning * into v_row;

  return public.to_supplement_completion_dto(v_row);
end;
$$;

-- This day's checklist — every item touched so far that day (untouched
-- items simply have no row; the client fills them in as unchecked).
create or replace function public.list_supplement_completions(p_local_date date)
returns setof public.supplement_completion_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_supplement_completion_dto(s)
  from public.supplement_completions s
  where s.user_id = auth.uid()
    and s.local_date = p_local_date;
$$;

revoke all on function public.set_supplement_completion(text, date, boolean, text) from public, anon;
revoke all on function public.list_supplement_completions(date) from public, anon;
grant execute on function public.set_supplement_completion(text, date, boolean, text) to authenticated;
grant execute on function public.list_supplement_completions(date) to authenticated;
