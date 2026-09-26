-- PICKER-CUSTOM-1 pivot (confirmed product decision, replacing rather than
-- expand-contracting the previous design): the three parameter-option lists
-- — quality / chronic symptom / protective response — stop being an
-- independent per-activity free-text override
-- (`activity_parameter_options.label`, materialized wholesale by
-- `set_parameter_options_override`) and become ONE shared, growable
-- vocabulary per type (`public.parameter_options`), with each activity
-- simply SELECTING which of those global options apply to it
-- (`public.activity_parameter_selections`).
--
-- Why a clean replacement, not expand-contract (per the brief): none of
-- `activity_parameter_options`/its RPCs has ever reached `main`/production —
-- it only ever existed on the test project and this branch's own migration
-- history. There is no live data this needs to protect, so this migration
-- drops the old table and every function whose SIGNATURE no longer applies,
-- and creates the new shape fresh. Any per-activity customization a test
-- account had under the old model is gone once this runs — expected and
-- accepted (test data only), not an oversight.
--
-- What's DELIBERATELY reused unchanged, not reinvented:
-- - `internal.parameter_option_in_use(p_type, p_label)` — the history-safety
--   check (`20260924062000_activity_parameter_options.sql`) is purely
--   type+label based, already decoupled from the table this migration drops.
--   `delete_parameter_option` below still calls it verbatim.
-- - `internal.assert_valid_quality`/`assert_valid_symptoms`/`assert_valid_flags`
--   (`20260924063000_parameter_options_validation.sql`) — their SIGNATURES
--   and rule-12 grandfather-by-`p_previous` behavior are untouched; they call
--   `internal.effective_parameter_options(p_activity_id, p_type)` by name,
--   and this migration only changes THAT function's own body (new tables
--   underneath), not its signature or callers. `create_scheduled_activity`/
--   `reschedule_scheduled_activity`/`set_scheduled_activity_quality`/
--   `set_scheduled_activity_symptoms`/`set_scheduled_activity_flags` and
--   `public.list_effective_parameter_options` (the logging flow's "what can
--   I pick from" call) all keep working unedited for the exact same reason.
--
-- Dropped as genuinely dead code while rewriting this layer (never called
-- from any client hook or UI — verified against `app/src` before dropping):
-- `update_parameter_option`/`reorder_parameter_options` (a per-option rename/
-- manual-reorder the old picker UI exposed a hook method for but never
-- actually wired to a control). Not carried forward — no loss of any real,
-- reachable feature.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Drop the old per-activity-override layer.
-- ---------------------------------------------------------------------------
drop function if exists public.reorder_parameter_options(uuid[]);
drop function if exists public.update_parameter_option(uuid, text, text);
drop function if exists public.set_parameter_options_override(uuid, text, text[]);
drop function if exists public.reset_parameter_options_to_inherited(uuid, text);
drop function if exists public.delete_parameter_option(uuid);
drop function if exists public.create_parameter_option(text, text, uuid, text, uuid);
drop function if exists public.list_parameter_options(uuid);
drop table if exists public.activity_parameter_options cascade;
-- The old table's own updated_at trigger function is dropped WITH the table
-- via the trigger (cascade), but the function itself isn't table-owned —
-- drop it explicitly too rather than leaving a dead, unreferenced function
-- behind (`public.set_parameter_options_updated_at` below is its from-
-- scratch replacement for the new table, a distinct function).
drop function if exists public.set_activity_parameter_options_updated_at();

-- ===========================================================================
-- `parameter_options` — the global, growable vocabulary. Essentially what
-- used to be the `activity_id is null` fallback tier, promoted to be the
-- ONLY tier that ever holds real label text; every activity now just picks
-- from this shared list instead of owning its own independent one.
-- ===========================================================================
create table public.parameter_options (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  parameter_type text not null check (parameter_type in ('quality', 'symptom', 'flag')),
  label text not null check (btrim(label) <> ''),
  icon_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index parameter_options_scope_idx
  on public.parameter_options (created_by, parameter_type, label);

create index parameter_options_created_by_idx on public.parameter_options (created_by);

create or replace function public.set_parameter_options_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger parameter_options_set_updated_at
  before update on public.parameter_options
  for each row execute function public.set_parameter_options_updated_at();

alter table public.parameter_options enable row level security;

create policy "read own parameter options"
  on public.parameter_options for select
  to authenticated
  using (created_by = (select auth.uid()));

create policy "insert own parameter options"
  on public.parameter_options for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- No update/delete policy: a label is never renamed any more (dropped, see
-- top-of-file note), and a real delete only ever happens through
-- `delete_parameter_option` below (SECURITY DEFINER), which enforces the
-- history-safety check itself — the same "no raw-DELETE path around the
-- check" reasoning the old table's own RLS comment already established.

-- ===========================================================================
-- `activity_parameter_selections` — which global options a specific
-- activity has explicitly chosen. Zero rows for a given (activity, type) =
-- this activity has never been customized for that type = it INHERITS (walk
-- `parent_id` up to the nearest ancestor with any rows for that type; if
-- none, the effective set is every option currently in `parameter_options`
-- for that type). Any rows = an explicit selection = exactly those, nothing
-- inherited, nothing implicitly added later.
--
-- `created_by` is a deliberate addition beyond the brief's own sketch (which
-- didn't include it) — sanity-checked against this schema's own overwhelming
-- convention (`tiles`/`activities`/the old `activity_parameter_options` all
-- denormalize an owner id for a trivial, non-join RLS check) rather than
-- requiring every policy here to reach through `activities`/`parameter_options`
-- via EXISTS. It costs one column; it buys the same simple, fast, consistent
-- ownership check every sibling table already uses.
-- ===========================================================================
create table public.activity_parameter_selections (
  activity_id uuid not null references public.activities (id) on delete cascade,
  option_id uuid not null references public.parameter_options (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, option_id)
);

create index activity_parameter_selections_activity_idx on public.activity_parameter_selections (activity_id);
create index activity_parameter_selections_option_idx on public.activity_parameter_selections (option_id);
create index activity_parameter_selections_created_by_idx on public.activity_parameter_selections (created_by);

alter table public.activity_parameter_selections enable row level security;

create policy "read own activity parameter selections"
  on public.activity_parameter_selections for select
  to authenticated
  using (created_by = (select auth.uid()));

-- Insert/delete get real RLS policies (unlike `parameter_options`) because,
-- unlike deleting a global option, toggling one activity's selection of an
-- already-existing option never needs a history-safety check — the row being
-- added/removed here is only ever "does this option currently apply to this
-- activity," never the logged value itself (that lives, decrypted-at-read,
-- on `scheduled_activities` — untouched by anything in this migration). So
-- `set_activity_parameter_selection`/`reset_activity_parameter_selection_to_
-- inherited` below can be plain (non-SECURITY-DEFINER) functions relying on
-- these policies, the same way `create_tile`/`create_activity` rely on RLS
-- rather than each re-deriving an ownership check by hand.
create policy "insert own activity parameter selections"
  on public.activity_parameter_selections for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.activities a where a.id = activity_id and a.created_by = (select auth.uid()))
    and exists (select 1 from public.parameter_options po where po.id = option_id and po.created_by = (select auth.uid()))
  );

create policy "delete own activity parameter selections"
  on public.activity_parameter_selections for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- ===========================================================================
-- Inheritance lookup, ID-shaped — the one place this rule lives at the row
-- level, reused by the checklist RPC below AND by `internal.effective_
-- parameter_options` (label-shaped, kept for the logging flow / validation —
-- see top-of-file note) so the two can never drift apart.
-- ===========================================================================
create or replace function internal.effective_parameter_option_ids(p_activity_id uuid, p_type text)
returns table (option_id uuid)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  with recursive chain(id, depth) as (
    select p_activity_id, 0
    where p_activity_id is not null
    union all
    select a.parent_id, chain.depth + 1
    from public.activities a
    join chain on a.id = chain.id
    where a.parent_id is not null
  ),
  -- The nearest node (itself first, then walking up) that has ANY of its own
  -- selection rows for this parameter type.
  nearest_owned(activity_id) as (
    select chain.id
    from chain
    where exists (
      select 1
      from public.activity_parameter_selections aps
      join public.parameter_options po on po.id = aps.option_id
      where aps.activity_id = chain.id and aps.created_by = auth.uid() and po.parameter_type = p_type
    )
    order by chain.depth
    limit 1
  )
  select aps.option_id
  from public.activity_parameter_selections aps
  join public.parameter_options po on po.id = aps.option_id
  where aps.created_by = auth.uid()
    and po.parameter_type = p_type
    and aps.activity_id = (select activity_id from nearest_owned)
  union all
  -- No node in the chain owns any rows (including "no activity at all",
  -- `p_activity_id is null`, where `chain`/`nearest_owned` are both empty) ->
  -- the effective set is simply every global option of this type.
  select po.id
  from public.parameter_options po
  where po.created_by = auth.uid()
    and po.parameter_type = p_type
    and not exists (select 1 from nearest_owned)
$$;

revoke all on function internal.effective_parameter_option_ids(uuid, text) from public, anon, authenticated;
grant execute on function internal.effective_parameter_option_ids(uuid, text) to authenticated, service_role;

-- Label-shaped view of the exact same resolution, kept for the logging
-- flow's "what can I pick from" read (`public.list_effective_parameter_
-- options`, unchanged below) and for `internal.assert_valid_*` — same
-- function NAME and signature the previous migration already established, so
-- neither of those needs a single edit.
create or replace function internal.effective_parameter_options(p_activity_id uuid, p_type text)
returns table (label text, icon_key text, sort_order integer)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  select po.label, po.icon_key, po.sort_order
  from public.parameter_options po
  join internal.effective_parameter_option_ids(p_activity_id, p_type) ids on ids.option_id = po.id
  where po.created_by = auth.uid()
  order by po.sort_order;
$$;

revoke all on function internal.effective_parameter_options(uuid, text) from public, anon, authenticated;
grant execute on function internal.effective_parameter_options(uuid, text) to authenticated, service_role;

-- `public.list_effective_parameter_options` itself is untouched (still
-- exists from `20260924062000_activity_parameter_options.sql`, still just
-- wraps `internal.effective_parameter_options` — no `create or replace`
-- needed here since neither its signature nor its body changes).

-- ===========================================================================
-- Provisioning — seeds ONLY this user's global vocabulary (the same
-- 18/6/14 default labels verbatim, now with no `activity_id` column to
-- scope them to at all). Idempotent, and still serializes concurrent callers
-- for the same user via the transaction-scoped advisory lock
-- `20260925060600_advisory_lock_provision_default_parameter_options.sql`
-- added — carried forward here since the underlying race (two
-- `useParameterOptions`/checklist hook instances both seeing "nothing
-- provisioned yet" at once) is unrelated to which table gets seeded.
-- ===========================================================================
create or replace function public.provision_default_parameter_options()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if exists (select 1 from public.parameter_options where created_by = v_user) then
    return;
  end if;

  insert into public.parameter_options (created_by, parameter_type, label, sort_order)
  select v_user, 'quality', v.label, v.ord
  from (values
    ('Resonance', 0), ('Flow', 1), ('Scattered', 2), ('Overstimulated', 3), ('Zone out', 4),
    ('Numb', 5), ('Engaged', 6), ('Bored', 7), ('Resistant', 8), ('Frozen', 9), ('Avoiding', 10),
    ('Confusion', 11), ('Compulsive persistent', 12), ('Interoceptive Override', 13), ('Addictive', 14),
    ('Nourishing', 15), ('Draining', 16), ('Energizing', 17)
  ) as v(label, ord);

  insert into public.parameter_options (created_by, parameter_type, label, sort_order)
  select v_user, 'symptom', v.label, v.ord
  from (values
    ('Pitta', 0), ('Inflammation', 1), ('Right knee pain', 2), ('Calves pain', 3), ('Temporal pain', 4), ('Dryness', 5)
  ) as v(label, ord);

  insert into public.parameter_options (created_by, parameter_type, label, sort_order)
  select v_user, 'flag', v.label, v.ord
  from (values
    ('Trauma Activation', 0), ('Triggered', 1), ('Attack', 2), ('Anger', 3), ('Procrastinated', 4),
    ('Shut Down', 5), ('Collapse', 6), ('Over Accommodating', 7), ('Hyper Responsibility', 8),
    ('Over Function', 9), ('Intellectualization', 10), ('Optimization', 11), ('Hyper Vigilance', 12),
    ('Problem Solving', 13)
  ) as v(label, ord);
end;
$$;

revoke all on function public.provision_default_parameter_options() from public, anon;
grant execute on function public.provision_default_parameter_options() to authenticated;

-- ===========================================================================
-- Global vocabulary CRUD (the ONLY place free-text label entry exists now).
-- ===========================================================================
create or replace function public.list_parameter_options()
returns setof public.parameter_options
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.parameter_options where created_by = auth.uid() order by parameter_type, sort_order;
$$;

revoke all on function public.list_parameter_options() from public, anon;
grant execute on function public.list_parameter_options() to authenticated;

create or replace function public.create_parameter_option(
  p_parameter_type text,
  p_label text,
  p_icon_key text default null,
  p_id uuid default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_sort_order integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_parameter_type not in ('quality', 'symptom', 'flag') then
    raise exception 'invalid_parameter_type' using errcode = '22023';
  end if;
  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.parameter_options
  where created_by = auth.uid() and parameter_type = p_parameter_type;

  insert into public.parameter_options (id, created_by, parameter_type, label, icon_key, sort_order)
  values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_parameter_type, btrim(p_label),
    nullif(btrim(coalesce(p_icon_key, '')), ''), v_sort_order
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    if p_id is not null then
      select id into v_id from public.parameter_options where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_parameter_option_failed' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_parameter_option(text, text, text, uuid) from public, anon;
grant execute on function public.create_parameter_option(text, text, text, uuid) to authenticated;

-- `internal.parameter_option_in_use` is untouched — see top-of-file note.

create or replace function public.delete_parameter_option(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_owner uuid;
  v_type text;
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select created_by, parameter_type, label into v_owner, v_type, v_label
  from public.parameter_options where id = p_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'parameter_option_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  if internal.parameter_option_in_use(v_type, v_label) then
    raise exception 'parameter_option_has_history' using errcode = 'P0001';
  end if;

  -- Cascades: every `activity_parameter_selections` row referencing this
  -- option (on any activity) is removed automatically via its FK — "merely
  -- selected somewhere but never logged" is fine and expected to just
  -- disappear from that activity's selection, per the brief.
  delete from public.parameter_options where id = p_id and created_by = auth.uid();
end;
$$;

revoke all on function public.delete_parameter_option(uuid) from public, anon;
grant execute on function public.delete_parameter_option(uuid) to authenticated;

-- ===========================================================================
-- Per-activity checklist (the picker/library UI's per-activity view) — every
-- global option of this type, with whether it's currently effective for this
-- activity (`selected`) and whether this activity has ANY own rows for this
-- type at all (`is_own` — same on every returned row; drives the "Inherited"
-- vs "Customized for this activity" label and whether "Reset to inherited"
-- is offered).
-- ===========================================================================
create or replace function public.list_activity_parameter_checklist(p_activity_id uuid, p_type text)
returns table (option_id uuid, label text, icon_key text, sort_order integer, selected boolean, is_own boolean)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  select
    po.id,
    po.label,
    po.icon_key,
    po.sort_order,
    exists (
      select 1 from internal.effective_parameter_option_ids(p_activity_id, p_type) ids where ids.option_id = po.id
    ),
    exists (
      select 1
      from public.activity_parameter_selections aps
      join public.parameter_options po2 on po2.id = aps.option_id
      where aps.activity_id = p_activity_id and aps.created_by = auth.uid() and po2.parameter_type = p_type
    )
  from public.parameter_options po
  where po.created_by = auth.uid() and po.parameter_type = p_type
  order by po.sort_order;
$$;

revoke all on function public.list_activity_parameter_checklist(uuid, text) from public, anon;
grant execute on function public.list_activity_parameter_checklist(uuid, text) to authenticated;

-- Toggle one option on/off for one activity. If this is the FIRST toggle for
-- this (activity, type) — i.e. it was purely inheriting — materializes the
-- full inherited set as this activity's own rows first, so everything it
-- used to inherit survives, THEN applies the one requested change on top.
-- Plain (non-SECURITY-DEFINER): relies on the RLS policies above, which are
-- sufficient here since no history-safety check applies to a selection row
-- (see this migration's own note on `activity_parameter_selections`).
create or replace function public.set_activity_parameter_selection(
  p_activity_id uuid,
  p_parameter_type text,
  p_option_id uuid,
  p_selected boolean
) returns void
language plpgsql
set search_path = public, internal, pg_temp
as $$
declare
  v_has_own boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_activity_id is null then
    raise exception 'activity_required' using errcode = '22023';
  end if;
  if p_parameter_type not in ('quality', 'symptom', 'flag') then
    raise exception 'invalid_parameter_type' using errcode = '22023';
  end if;
  if not exists (select 1 from public.activities where id = p_activity_id and created_by = auth.uid()) then
    raise exception 'invalid_activity' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.parameter_options
    where id = p_option_id and created_by = auth.uid() and parameter_type = p_parameter_type
  ) then
    raise exception 'invalid_option' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.activity_parameter_selections aps
    join public.parameter_options po on po.id = aps.option_id
    where aps.activity_id = p_activity_id and aps.created_by = auth.uid() and po.parameter_type = p_parameter_type
  ) into v_has_own;

  if not v_has_own then
    insert into public.activity_parameter_selections (activity_id, option_id, created_by)
    select p_activity_id, ids.option_id, auth.uid()
    from internal.effective_parameter_option_ids(p_activity_id, p_parameter_type) ids
    on conflict (activity_id, option_id) do nothing;
  end if;

  if p_selected then
    insert into public.activity_parameter_selections (activity_id, option_id, created_by)
    values (p_activity_id, p_option_id, auth.uid())
    on conflict (activity_id, option_id) do nothing;
  else
    delete from public.activity_parameter_selections
    where activity_id = p_activity_id and option_id = p_option_id and created_by = auth.uid();
  end if;
end;
$$;

revoke all on function public.set_activity_parameter_selection(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.set_activity_parameter_selection(uuid, text, uuid, boolean) to authenticated;

-- "Reset to inherited" — deletes ALL of this activity's own selection rows
-- for one type, falling back to whatever its nearest ancestor (or the full
-- global list) already provides. No history-safety check needed (see above)
-- — unlike the old `reset_parameter_options_to_inherited`, this can never be
-- partially honored/report a `skipped_label`.
create or replace function public.reset_activity_parameter_selection_to_inherited(
  p_activity_id uuid,
  p_parameter_type text
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_activity_id is null then
    raise exception 'activity_required' using errcode = '22023';
  end if;

  delete from public.activity_parameter_selections aps
  using public.parameter_options po
  where aps.option_id = po.id
    and aps.activity_id = p_activity_id
    and aps.created_by = auth.uid()
    and po.parameter_type = p_parameter_type;
end;
$$;

revoke all on function public.reset_activity_parameter_selection_to_inherited(uuid, text) from public, anon;
grant execute on function public.reset_activity_parameter_selection_to_inherited(uuid, text) to authenticated;

-- ===========================================================================
-- Sanity checks — throwaway-probe-user do-block, this codebase's established
-- convention (see e.g. `20260924063000_parameter_options_validation.sql`'s
-- own). The whole file runs as one transaction: a failed assertion here
-- rolls back everything above too (including the probe's own `auth.users`
-- insert), rather than leaving a half-applied schema or a stray probe row
-- behind — the same discipline asked for explicitly this round.
-- ===========================================================================
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_activity_id uuid;
  v_child_id uuid;
  v_flow_option_id uuid;
  v_resonance_option_id uuid;
  v_count integer;
  v_selected boolean;
  v_is_own boolean;
  v_raised boolean;
  v_sa_id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.provision_default_tiles();
  perform public.provision_default_activities();
  perform public.provision_default_parameter_options();

  select count(*) into v_count from public.parameter_options where created_by = v_probe and parameter_type = 'quality';
  if v_count <> 18 then
    raise exception 'provisioning check: expected 18 default quality options, got %', v_count;
  end if;

  select id into v_activity_id from public.activities where created_by = v_probe and parent_id is null limit 1;
  select id into v_child_id from public.activities where created_by = v_probe and parent_id = v_activity_id limit 1;

  -- Fresh activity, no selection rows at all: effective set is the FULL
  -- global list.
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 18 then
    raise exception 'inheritance check: expected all 18 quality options for an unconfigured activity, got %', v_count;
  end if;

  select id into v_flow_option_id from public.parameter_options where created_by = v_probe and parameter_type = 'quality' and label = 'Flow';
  select id into v_resonance_option_id from public.parameter_options where created_by = v_probe and parameter_type = 'quality' and label = 'Resonance';

  -- Toggling ONE option off a never-customized activity materializes the
  -- rest (17 of 18), not just the one row.
  perform public.set_activity_parameter_selection(v_activity_id, 'quality', v_flow_option_id, false);
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 17 then
    raise exception 'materialize-on-toggle check: expected 17 quality options after unchecking one, got %', v_count;
  end if;
  select count(*) into v_count from public.activity_parameter_selections
  where activity_id = v_activity_id and created_by = v_probe;
  if v_count <> 17 then
    raise exception 'materialize-on-toggle check: expected 17 own selection rows, got %', v_count;
  end if;

  -- A child of that activity with no override of its own inherits the
  -- PARENT's 17, not the full 18.
  if v_child_id is not null then
    select count(*) into v_count from public.list_effective_parameter_options(v_child_id, 'quality');
    if v_count <> 17 then
      raise exception 'inheritance check: expected child to inherit parent''s 17 quality options, got %', v_count;
    end if;
  end if;

  -- Toggling again (already customized) is a plain add — back to 18 without
  -- re-materializing.
  perform public.set_activity_parameter_selection(v_activity_id, 'quality', v_flow_option_id, true);
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 18 then
    raise exception 'plain-toggle check: expected 18 quality options after re-checking, got %', v_count;
  end if;

  -- The checklist RPC reports selected + is_own consistently.
  select selected, is_own into v_selected, v_is_own
  from public.list_activity_parameter_checklist(v_activity_id, 'quality')
  where option_id = v_flow_option_id;
  if not v_selected or not v_is_own then
    raise exception 'checklist check: expected the re-checked option selected=true, is_own=true, got selected=%, is_own=%', v_selected, v_is_own;
  end if;

  -- Reset to inherited clears this activity's own rows entirely, reverting
  -- to the full 18 again via inheritance, not a stored copy.
  perform public.reset_activity_parameter_selection_to_inherited(v_activity_id, 'quality');
  select count(*) into v_count from public.activity_parameter_selections
  where activity_id = v_activity_id and created_by = v_probe;
  if v_count <> 0 then
    raise exception 'reset check: expected zero own selection rows after reset, got %', v_count;
  end if;
  select count(*) into v_count from public.list_effective_parameter_options(v_activity_id, 'quality');
  if v_count <> 18 then
    raise exception 'reset check: expected all 18 quality options again after reset, got %', v_count;
  end if;

  -- assert_valid_quality rejects a label outside a narrowed activity's list.
  perform public.set_activity_parameter_selection(v_activity_id, 'quality', v_resonance_option_id, false);
  v_raised := false;
  begin
    perform internal.assert_valid_quality(array['Resonance'], v_activity_id);
  exception when sqlstate '22023' then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'validation check: expected "Resonance" to be rejected once this activity excludes it';
  end if;
  -- Rule 12: a value already present in `p_previous` rides through unchanged.
  perform internal.assert_valid_quality(array['Resonance'], v_activity_id, array['Resonance']);

  -- Deleting a global option that's in real logged history is blocked.
  perform public.create_scheduled_activity(
    p_activity_id := v_activity_id,
    p_path := '{}'::text[],
    p_start_at := now(),
    p_duration_minutes := 30,
    p_local_date := current_date,
    p_start_minute := 600::smallint,
    p_timezone := 'UTC',
    p_quality := array['Flow'],
    p_id := v_sa_id
  );
  v_raised := false;
  begin
    perform public.delete_parameter_option(v_flow_option_id);
  exception when sqlstate 'P0001' then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'history-safety check: expected deleting "Flow" (in use) to be blocked';
  end if;

  -- Deleting a global option that's merely SELECTED (never logged)
  -- cascades it out of `activity_parameter_selections` cleanly.
  perform public.set_activity_parameter_selection(v_activity_id, 'symptom', (
    select id from public.parameter_options where created_by = v_probe and parameter_type = 'symptom' and label = 'Pitta'
  ), false);
  perform public.delete_parameter_option((
    select id from public.parameter_options where created_by = v_probe and parameter_type = 'symptom' and label = 'Dryness'
  ));
  if exists (
    select 1 from public.activity_parameter_selections aps
    join public.parameter_options po on po.id = aps.option_id
    where aps.created_by = v_probe and po.label = 'Dryness'
  ) then
    raise exception 'cascade-delete check: expected "Dryness" fully gone from selections after delete';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  -- The probe's own logged `scheduled_activities` row (created above to
  -- exercise the history-safety check) has to go BEFORE the tiles/activities
  -- cascade below — `scheduled_activities.activity_id` has no `on delete
  -- cascade` of its own (by design: real history must never silently vanish
  -- just because its activity type is later deleted), so it would otherwise
  -- block the cascade with a foreign-key violation.
  delete from public.scheduled_activities where user_id = v_probe;
  delete from public.tiles where created_by = v_probe;
  delete from auth.users where id = v_probe;
  raise notice 'parameter_options_global_vocabulary: ALL CHECKS PASSED';
end $$;
