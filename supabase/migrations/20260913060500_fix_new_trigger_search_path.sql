-- The two `updated_at` trigger functions added alongside `daily_values` and
-- `supplement_completions` (20260913060300/20260913060400) were written
-- without `set search_path`, which the security linter flags (mutable
-- search_path on a SECURITY INVOKER function is a real, if low-severity,
-- hijack surface). Every other trigger function in this project already
-- pins it — see `set_updated_at`'s own fix in
-- 20260826063600_lock_down_function_grants.sql, which this mirrors exactly
-- (`pg_temp` alone is enough here: the body touches no table, only `new`).

create or replace function public.set_daily_values_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_supplement_completions_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
