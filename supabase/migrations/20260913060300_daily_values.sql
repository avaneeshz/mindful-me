-- New header button: Protein. A per-day number the user re-enters and which
-- REPLACES the day's prior value (never additive/summed) — the same model
-- `Steps` already uses today, EXCEPT `Steps` currently stores that per-day
-- number purely client-side (`lib/displayValuesLocalStore.ts`, `localStorage`
-- only, never synced — confirmed by reading that module: there is no
-- `api/*` call anywhere in its path).
--
-- Product/architecture call, flagged explicitly per the full-stack-engineer
-- agent definition's own instruction to surface this rather than bury it:
-- Protein is a BRAND NEW button with no legacy local-only behaviour to
-- preserve, and the Target Architecture's default is local-first-but-synced
-- (rule 6) — `Steps` staying local-only was a deliberate, EXPLICITLY SCOPED
-- exception carved out when Vipassana/Sun/Moon moved onto the real engine
-- ("Steps is intentionally untouched... out of scope per the agent
-- definition's own instruction not to scope-creep" — see
-- 20260910100000_activities_entry_mode.sql), not a general precedent that
-- every simple per-day counter should stay device-only. So Protein gets a
-- real, synced, per-user table here. `Steps` is deliberately left
-- untouched by this migration (still out of scope) — it could adopt the
-- same table later with zero schema change, since this is intentionally
-- generalized by a `metric_key` column rather than a `protein_grams`-shaped
-- one-off table, but nothing about that migration is done here.
--
-- Not encrypted (rule 10 territory, considered and deliberately declined):
-- rule 10 names flags/quality/symptoms/notes and "every similarly sensitive
-- field" — a plain daily gram count is a fitness metric in the same tier as
-- `Steps` (also unencrypted, if it's ever moved server-side), not a
-- protective-response/trauma/symptom-shaped field. If that judgment is
-- wrong, adding encryption later is a mechanical follow-up (see the
-- `note_entries`/`scheduled_activities` migrations' own encrypt/decrypt
-- pattern) without a shape change to this table.
create table public.daily_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Small fixed set today (just 'protein'), open-ended by design so a future
  -- button (or `Steps`, later) can reuse this table without a new migration.
  metric_key text not null check (metric_key in ('protein')),
  local_date date not null,
  value integer not null check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "Each entry REPLACES the day's value" — the UNIQUE constraint an upsert
  -- (`on conflict`) needs to make that well-defined and idempotent.
  unique (user_id, metric_key, local_date)
);

-- Rule 8 — every read is scoped to a window (here: one metric's history for
-- one user, the only read path this feature has — see `list_daily_values`
-- below), never the user's unbounded full history in one unscoped query.
create index daily_values_user_metric_date_idx
  on public.daily_values (user_id, metric_key, local_date desc);

create or replace function public.set_daily_values_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger daily_values_set_updated_at
  before update on public.daily_values
  for each row execute function public.set_daily_values_updated_at();

alter table public.daily_values enable row level security;

create policy "read own daily values"
  on public.daily_values for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own daily values"
  on public.daily_values for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own daily values"
  on public.daily_values for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create type public.daily_value_dto as (
  metric_key text,
  local_date date,
  value integer,
  updated_at timestamptz
);

create or replace function public.to_daily_value_dto(r public.daily_values)
returns public.daily_value_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(r.metric_key, r.local_date, r.value, r.updated_at)::public.daily_value_dto
$$;

-- "Each entry REPLACES the day's value" — an upsert keyed on the same
-- (user, metric, day) the UNIQUE constraint enforces. `p_value` of `null`
-- is not accepted here (deleting/clearing a day's value isn't a product
-- requirement — the client's own "blank clears it" affordance only applies
-- to the local `Steps` counter); a real edit always sends a real integer.
create or replace function public.set_daily_value(
  p_metric_key text,
  p_local_date date,
  p_value integer
) returns public.daily_value_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.daily_values;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_metric_key not in ('protein') then
    raise exception 'invalid_metric_key' using errcode = '22023';
  end if;

  if p_value is null or p_value < 0 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  insert into public.daily_values (user_id, metric_key, local_date, value)
  values (auth.uid(), p_metric_key, p_local_date, p_value)
  on conflict (user_id, metric_key, local_date) do update set value = excluded.value
  where public.daily_values.user_id = auth.uid()
  returning * into v_row;

  return public.to_daily_value_dto(v_row);
end;
$$;

-- One metric's history for the current user, newest first — same
-- "unbounded but naturally small (at most one row per calendar day)"
-- reasoning `list_note_entries` already documents; not the kind of
-- unbounded-growth read rule 8 was written to guard against.
create or replace function public.list_daily_values(p_metric_key text)
returns setof public.daily_value_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_daily_value_dto(d)
  from public.daily_values d
  where d.user_id = auth.uid()
    and d.metric_key = p_metric_key
  order by d.local_date desc;
$$;

revoke all on function public.set_daily_value(text, date, integer) from public, anon;
revoke all on function public.list_daily_values(text) from public, anon;
grant execute on function public.set_daily_value(text, date, integer) to authenticated;
grant execute on function public.list_daily_values(text) to authenticated;
