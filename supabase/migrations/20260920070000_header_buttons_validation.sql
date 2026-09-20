-- Second half of HEADER-CUSTOM-1 (see `20260920060000_header_buttons.sql`
-- for the config tables + seed themselves): moves `note_entries.button_key`
-- (+ `gift_type`), `daily_values.metric_key` and
-- `supplement_completions.item_key` validation off their old fixed CHECK
-- constraints and onto the new `header_buttons` config, so a
-- dynamically-added button's storage key is actually accepted — a CHECK
-- constraint can't reference another table, so a real, closed-set CHECK can
-- never have expressed "any key currently configured in header_buttons",
-- only a trigger can.
--
-- Expand-contract, staged explicitly within this one file (never a
-- single-step swap, per WORKFLOW.md): each trigger is created FIRST, then a
-- `do $$ ... $$` block asserts it accepts every value the corresponding old
-- CHECK constraint accepted — the migration itself fails loudly (not
-- silently) if that's ever not true — and only THEN is the old CHECK
-- constraint dropped. `supplement_completions` additionally gains one new
-- column (`header_button_id`) ahead of its own trigger, needed once more
-- than one checklist can exist — backfilled before being made NOT NULL, so
-- the 7 existing/seed-path rows this table can ever hold in this project
-- keep meaning exactly what they mean today (rule: never lose meaning for
-- existing rows).

-- ===========================================================================
-- supplement_completions: add header_button_id (additive, then required).
-- ===========================================================================
alter table public.supplement_completions add column header_button_id uuid references public.header_buttons (id);

update public.supplement_completions sc
set header_button_id = (
  select hb.id from public.header_buttons hb
  where hb.category = 'checklist' and hb.created_by is null and hb.label = 'Supplements'
  limit 1
)
where header_button_id is null;

do $$
begin
  if exists (select 1 from public.supplement_completions where header_button_id is null) then
    raise exception 'supplement_completions backfill left rows with a null header_button_id';
  end if;
end $$;

alter table public.supplement_completions alter column header_button_id set not null;

-- The old uniqueness was (user, item, day) — a single global checklist.
-- Widened to (user, button, item, day) now that multiple independent
-- checklists can exist; every existing row's item_key already only ever
-- belonged to the one Supplements checklist, so this is a pure widening, not
-- a narrowing that could reject a backfilled row.
alter table public.supplement_completions drop constraint supplement_completions_user_id_item_key_local_date_key;
alter table public.supplement_completions add constraint supplement_completions_user_button_item_date_key
  unique (user_id, header_button_id, item_key, local_date);

create index supplement_completions_header_button_idx on public.supplement_completions (header_button_id);

-- --- Trigger-based item_key validation, staged. ---------------------------
create or replace function public.validate_supplement_completion_item_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.header_button_checklist_items ci
    join public.header_buttons hb on hb.id = ci.header_button_id
    where ci.header_button_id = new.header_button_id
      and ci.item_key = new.item_key
      and (hb.created_by is null or hb.created_by = new.user_id)
  ) then
    raise exception 'invalid_item_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- INSERT-only: `item_key`/`header_button_id` are write-once in practice
-- (the upsert in `set_supplement_completion` only ever changes `done`/
-- `note_encrypted`/`completed_at` on conflict) — an UPDATE trigger would
-- otherwise also fire (and need to re-validate) on every plain toggle/note
-- edit for no product reason.
create trigger supplement_completions_validate_item_key
  before insert on public.supplement_completions
  for each row execute function public.validate_supplement_completion_item_key();

do $$
declare
  v_missing text[];
begin
  select array_agg(v) into v_missing
  from unnest(array['zinc', 'omega', 'magnesium', 'ayurveda_skin', 'ayurveda_fibroid', 'ayurveda_varicose', 'multivitamin']) as v
  where not exists (
    select 1 from public.header_button_checklist_items ci
    join public.header_buttons hb on hb.id = ci.header_button_id
    where hb.category = 'checklist' and hb.created_by is null and hb.label = 'Supplements' and ci.item_key = v
  );
  if v_missing is not null then
    raise exception 'header_button_checklist_items missing item_key(s) the old CHECK constraint accepted: %', v_missing;
  end if;
end $$;

alter table public.supplement_completions drop constraint supplement_completions_item_key_check;

create or replace function public.set_supplement_completion(
  p_header_button_id uuid,
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

  if not exists (
    select 1 from public.header_button_checklist_items ci
    join public.header_buttons hb on hb.id = ci.header_button_id
    where ci.header_button_id = p_header_button_id and ci.item_key = p_item_key
      and (hb.created_by is null or hb.created_by = auth.uid())
  ) then
    raise exception 'invalid_item_key' using errcode = '22023';
  end if;

  insert into public.supplement_completions (user_id, header_button_id, item_key, local_date, done, note_encrypted, completed_at)
  values (
    auth.uid(), p_header_button_id, p_item_key, p_local_date, coalesce(p_done, false),
    internal.encrypt_supplement_note(p_note),
    case when coalesce(p_done, false) then now() else null end
  )
  on conflict (user_id, header_button_id, item_key, local_date) do update set
    done = excluded.done,
    note_encrypted = excluded.note_encrypted,
    completed_at = case when excluded.done then coalesce(public.supplement_completions.completed_at, now()) else null end
  where public.supplement_completions.user_id = auth.uid()
  returning * into v_row;

  return public.to_supplement_completion_dto(v_row);
end;
$$;

-- This day's checklist for ONE checklist button (a user may now have more
-- than one) — every item touched so far that day for that specific button.
create or replace function public.list_supplement_completions(
  p_header_button_id uuid,
  p_local_date date
) returns setof public.supplement_completion_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_supplement_completion_dto(s)
  from public.supplement_completions s
  where s.user_id = auth.uid()
    and s.header_button_id = p_header_button_id
    and s.local_date = p_local_date;
$$;

drop function if exists public.set_supplement_completion(text, date, boolean, text);
drop function if exists public.list_supplement_completions(date);

revoke all on function public.set_supplement_completion(uuid, text, date, boolean, text) from public, anon;
revoke all on function public.list_supplement_completions(uuid, date) from public, anon;
grant execute on function public.set_supplement_completion(uuid, text, date, boolean, text) to authenticated;
grant execute on function public.list_supplement_completions(uuid, date) to authenticated;

-- ===========================================================================
-- daily_values.metric_key
-- ===========================================================================
create or replace function public.validate_daily_value_metric_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.header_buttons
    where category = 'day_value' and key = new.metric_key
      and (created_by is null or created_by = new.user_id)
  ) then
    raise exception 'invalid_metric_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- INSERT-only — `metric_key` never changes on `set_daily_value`'s own
-- upsert conflict path (only `value` does).
create trigger daily_values_validate_metric_key
  before insert on public.daily_values
  for each row execute function public.validate_daily_value_metric_key();

do $$
declare
  v_missing text[];
begin
  select array_agg(v) into v_missing
  from unnest(array['protein', 'steps']) as v
  where not exists (
    select 1 from public.header_buttons where category = 'day_value' and created_by is null and key = v
  );
  if v_missing is not null then
    raise exception 'header_buttons missing day_value key(s) the old CHECK constraint accepted: %', v_missing;
  end if;
end $$;

alter table public.daily_values drop constraint daily_values_metric_key_check;

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

  if not exists (
    select 1 from public.header_buttons
    where category = 'day_value' and key = p_metric_key and (created_by is null or created_by = auth.uid())
  ) then
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

-- ===========================================================================
-- note_entries.button_key (+ gift_type) — not literally named in the CHECK-
-- constraint-replacement list the brief calls out for checklist/day_value,
-- but the same problem applies once 'notes' buttons are dynamic too, so this
-- gets the identical expand-contract treatment.
-- ===========================================================================
create or replace function public.validate_note_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_button_id uuid;
  v_type_count integer;
begin
  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = new.button_key and (created_by is null or created_by = new.user_id)
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if new.gift_type is not null then
    if v_type_count = 0 then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = new.gift_type
    ) then
      raise exception 'invalid_gift_type' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

-- INSERT-only — `button_key` is never editable (`update_note_entry` only
-- ever changes `note_encrypted`/`gift_type`, both already re-validated by
-- `update_note_entry` itself below, not by re-running this trigger's
-- button_key lookup against a column that didn't change).
create trigger note_entries_validate_before_insert
  before insert on public.note_entries
  for each row execute function public.validate_note_entry();

do $$
declare
  v_missing text[];
begin
  -- Every button_key the old CHECK accepted (the 4 live notes buttons + the
  -- 5 retired ones seeded with `default_hidden = true` in the prior
  -- migration specifically so this still holds).
  select array_agg(v) into v_missing
  from unnest(array['gifts', 'chits', 'opportunities', 'learnings', 'mirror', 'prayer', 'scriptures', 'summons', 'worship']) as v
  where not exists (
    select 1 from public.header_buttons where category = 'notes' and created_by is null and key = v
  );
  if v_missing is not null then
    raise exception 'header_buttons missing notes button_key(s) the old CHECK constraint accepted: %', v_missing;
  end if;

  -- gift_type: the old CHECK's 15-value union, for the two buttons that
  -- still have a live type selector (gifts/learnings) — 'prayer' is retired
  -- (see the migration's own top-of-file note: its old 7-value vocabulary is
  -- not carried forward, since nothing writes under that key any more).
  select array_agg(v) into v_missing
  from unnest(array['Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier']) as v
  where not exists (
    select 1 from public.header_button_note_types nt
    join public.header_buttons hb on hb.id = nt.header_button_id
    where hb.category = 'notes' and hb.created_by is null and hb.key = 'gifts' and nt.value = v
  );
  if v_missing is not null then
    raise exception 'header_button_note_types missing gifts value(s) the old CHECK constraint accepted: %', v_missing;
  end if;

  select array_agg(v) into v_missing
  from unnest(array['Given', 'Realized', 'Revealed']) as v
  where not exists (
    select 1 from public.header_button_note_types nt
    join public.header_buttons hb on hb.id = nt.header_button_id
    where hb.category = 'notes' and hb.created_by is null and hb.key = 'learnings' and nt.value = v
  );
  if v_missing is not null then
    raise exception 'header_button_note_types missing learnings value(s) the old CHECK constraint accepted: %', v_missing;
  end if;
end $$;

alter table public.note_entries drop constraint note_entries_button_key_check;
alter table public.note_entries drop constraint note_entries_gift_type_check;
alter table public.note_entries drop constraint gift_type_only_for_gifts;

create or replace function public.create_note_entry(
  p_button_key text,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_id uuid;
  v_type_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = p_button_key and (created_by is null or created_by = auth.uid())
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if v_type_count > 0 then
    if p_gift_type is null or not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = p_gift_type
    ) then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  insert into public.note_entries (user_id, button_key, note_encrypted, gift_type)
  values (
    auth.uid(), p_button_key, internal.encrypt_note_entry_text(p_note),
    case when v_type_count > 0 then p_gift_type else null end
  )
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

create or replace function public.update_note_entry(
  p_id uuid,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_key text;
  v_button_id uuid;
  v_type_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  select button_key into v_button_key
  from public.note_entries
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if v_button_key is null then
    raise exception 'note_entry_not_found' using errcode = 'P0002';
  end if;

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = v_button_key and (created_by is null or created_by = auth.uid())
  limit 1;

  select count(*) into v_type_count from public.header_button_note_types where header_button_id = v_button_id;

  if v_type_count > 0 then
    if p_gift_type is null or not exists (
      select 1 from public.header_button_note_types where header_button_id = v_button_id and value = p_gift_type
    ) then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  update public.note_entries
  set note_encrypted = internal.encrypt_note_entry_text(p_note),
      gift_type = case when v_type_count > 0 then p_gift_type else null end
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;
