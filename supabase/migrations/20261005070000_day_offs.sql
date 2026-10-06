-- Non-working days ("Day off"). The user taps the header date and marks the
-- viewed calendar day as a day off, with an optional free-text reason
-- ("Public holiday", "Sick", "Travel"…). Any date may be marked — past,
-- today or future — and the label shows on that day's header date.
--
-- One row per (user, calendar day). The day is a plain `local_date` (the
-- user's own calendar day, never a UTC instant), plus the IANA time zone it
-- was marked in (CLAUDE.md portability rule 6).
--
-- Rule 10: the reason is personal free text, so it is encrypted at rest with
-- its own Vault key and its own `internal`-schema encrypt/decrypt pair —
-- exactly the `note_entries` pattern. The date itself is not sensitive.
--
-- Rule 11: un-marking is a soft delete (`deleted_at`), purged after 30 days
-- by a daily pg_cron job; re-marking the same day revives the row. There is
-- deliberately no DELETE RLS policy.
--
-- Rule 8: the only read is window-scoped (`list_day_offs(p_from, p_to)`).

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'day_offs_reason_key',
  'Symmetric key for encrypting day_offs.reason_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'day_offs_reason_key'
);

create function internal.encrypt_day_off_reason(reason text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when reason is null then null
    else extensions.pgp_sym_encrypt(
      reason,
      (select decrypted_secret from vault.decrypted_secrets where name = 'day_offs_reason_key')
    )
  end
$$;

create function internal.decrypt_day_off_reason(encrypted bytea)
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
      (select decrypted_secret from vault.decrypted_secrets where name = 'day_offs_reason_key')
    )
  end
$$;

revoke all on function internal.encrypt_day_off_reason(text) from public, anon, authenticated;
revoke all on function internal.decrypt_day_off_reason(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_day_off_reason(text) to authenticated, service_role;
grant execute on function internal.decrypt_day_off_reason(bytea) to authenticated, service_role;

create table public.day_offs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  time_zone text not null,
  reason_encrypted bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, local_date)
);

create index day_offs_user_date_idx on public.day_offs (user_id, local_date);

create or replace function public.set_day_offs_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger day_offs_set_updated_at
  before update on public.day_offs
  for each row execute function public.set_day_offs_updated_at();

alter table public.day_offs enable row level security;

-- No `deleted_at is null` here: RLS re-checks an UPDATE's resulting row (and
-- an upsert's existing row) against the SELECT policy, so filtering it would
-- break both the soft delete and re-marking — the exact bug fixed in
-- 20260914080000_fix_note_entries_delete_rls.sql. `list_day_offs` filters.
create policy "read own day offs"
  on public.day_offs for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own day offs"
  on public.day_offs for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- `using` deliberately does NOT filter `deleted_at`: re-marking a day revives
-- its soft-deleted row through the upsert below.
create policy "update own day offs"
  on public.day_offs for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create type public.day_off_dto as (
  local_date date,
  time_zone text,
  reason text,
  updated_at timestamptz
);

create or replace function public.to_day_off_dto(r public.day_offs)
returns public.day_off_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(r.local_date, r.time_zone, internal.decrypt_day_off_reason(r.reason_encrypted), r.updated_at)::public.day_off_dto
$$;

-- Marks (or re-marks, or edits the reason of) one calendar day. A blank
-- reason is stored as NULL. Reason capped at 280 characters.
create or replace function public.set_day_off(
  p_local_date date,
  p_time_zone text,
  p_reason text default null
) returns public.day_off_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.day_offs;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_local_date is null then
    raise exception 'local_date_required' using errcode = '22023';
  end if;

  if p_time_zone is null or not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'invalid_time_zone' using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 280 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  insert into public.day_offs (user_id, local_date, time_zone, reason_encrypted)
  values (auth.uid(), p_local_date, p_time_zone, internal.encrypt_day_off_reason(v_reason))
  on conflict (user_id, local_date) do update
    set time_zone = excluded.time_zone,
        reason_encrypted = excluded.reason_encrypted,
        deleted_at = null
  where public.day_offs.user_id = auth.uid()
  returning * into v_row;

  return public.to_day_off_dto(v_row);
end;
$$;

-- Un-marks one calendar day (rule 11 soft delete). A no-op when the day
-- isn't marked.
create or replace function public.clear_day_off(p_local_date date)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.day_offs
  set deleted_at = now()
  where user_id = auth.uid() and local_date = p_local_date and deleted_at is null;
$$;

-- Every marked day in [p_from, p_to] inclusive — always window-scoped (rule 8).
create or replace function public.list_day_offs(p_from date, p_to date)
returns setof public.day_off_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_day_off_dto(d)
  from public.day_offs d
  where d.user_id = auth.uid()
    and d.deleted_at is null
    and d.local_date between p_from and p_to
  order by d.local_date;
$$;

-- Rule 11's 30-day purge, mirroring `purge_deleted_note_entries`.
create or replace function public.purge_deleted_day_offs()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.day_offs
  where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;

select cron.schedule(
  'purge-deleted-day-offs',
  '0 3 * * *',
  $$select public.purge_deleted_day_offs()$$
)
where not exists (
  select 1 from cron.job where jobname = 'purge-deleted-day-offs'
);

revoke all on function public.set_day_off(date, text, text) from public, anon;
revoke all on function public.clear_day_off(date) from public, anon;
revoke all on function public.list_day_offs(date, date) from public, anon;
revoke all on function public.purge_deleted_day_offs() from public, anon, authenticated;
revoke all on function public.to_day_off_dto(public.day_offs) from public, anon;
revoke all on function public.set_day_offs_updated_at() from public, anon, authenticated;
grant execute on function public.set_day_off(date, text, text) to authenticated;
grant execute on function public.clear_day_off(date) to authenticated;
grant execute on function public.list_day_offs(date, date) to authenticated;
grant execute on function public.to_day_off_dto(public.day_offs) to authenticated;
