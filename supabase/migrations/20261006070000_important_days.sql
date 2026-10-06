-- Personal important days for the Classic calendar (#10): birthdays,
-- anniversaries and the like. Always yearly, so only month + day are stored
-- (no year). Feb 29 is allowed; in a non-leap year the app shows it on
-- Feb 28. Synced across devices, owned per user, written only via RPCs.

create table public.important_days (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (btrim(name) <> '' and length(name) <= 80),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Checked against a leap year, so Feb 29 is valid and Feb 30 / Apr 31 aren't.
  constraint important_days_real_date check (
    day <= extract(day from (make_date(2024, month, 1) + interval '1 month - 1 day'))
  )
);

create index important_days_created_by_idx on public.important_days (created_by);

alter table public.important_days enable row level security;

create policy "read own important days"
  on public.important_days for select
  to authenticated
  using (created_by = (select auth.uid()));

create policy "update own important days"
  on public.important_days for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "delete own important days"
  on public.important_days for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- Inserts go through `create_important_day` only, which caps a user at 500.
create or replace function public.create_important_day(
  p_id uuid,
  p_name text,
  p_month smallint,
  p_day smallint
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'id_required' using errcode = '22023';
  end if;
  if (select count(*) from public.important_days where created_by = auth.uid()) >= 500 then
    raise exception 'important_day_limit_reached' using errcode = '22023';
  end if;
  insert into public.important_days (id, created_by, name, month, day)
  values (p_id, auth.uid(), btrim(p_name), p_month, p_day);
  return p_id;
end;
$$;

revoke all on function public.create_important_day(uuid, text, smallint, smallint) from public, anon;
grant execute on function public.create_important_day(uuid, text, smallint, smallint) to authenticated;

create or replace function public.update_important_day(
  p_id uuid,
  p_name text,
  p_month smallint,
  p_day smallint
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.important_days
  set name = btrim(p_name), month = p_month, day = p_day, updated_at = now()
  where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'important_day_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_important_day(uuid, text, smallint, smallint) from public, anon;
grant execute on function public.update_important_day(uuid, text, smallint, smallint) to authenticated;

create or replace function public.delete_important_day(p_id uuid) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.important_days where id = p_id and created_by = auth.uid();
end;
$$;

revoke all on function public.delete_important_day(uuid) from public, anon;
grant execute on function public.delete_important_day(uuid) to authenticated;
