-- Generalizes `header_button_note_fields` beyond plain text: a field can now
-- be `field_kind: 'text'` (unchanged — Note/Dreams, capped at 2, still bound
-- to `scheduled_activities.notes_encrypted`/`dreams_encrypted`, the physical
-- limit that table actually has) or `field_kind: 'multiselect'` (new — a
-- user-defined option list, NOT capped, backed by its own child tables so it
-- never hits that same physical-column ceiling).
--
-- This retires Sleep's old hardcoded special case
-- (`header_buttons.quick_log_sleep_quality` + the client's fixed 11-value
-- `SleepQualityId` vocabulary) by migrating it FORWARD onto this same
-- generic mechanism, not dropping the capability: the seeded Sleep button
-- keeps its "How was your sleep?" picker, now as an ordinary multiselect
-- field with 11 ordinary user-editable options, indistinguishable from any
-- other multiselect field a user configures on any other activity button.
--
-- Three schema pieces:
--   1. `header_button_note_fields.field_kind` (+ the new column is nullable-
--      compatible with existing `field_key` — see below). Pre-release table
--      (this whole feature hasn't shipped to production yet), so freely
--      alterable — no expand-contract needed for this part.
--   2. `header_button_field_options` — a multiselect field's own option
--      list, owned/CRUD-able exactly like every other child config table in
--      this schema (owner-only RLS via the `header_buttons` join chain).
--   3. `scheduled_activity_field_selections` — the SELECTED values on one
--      logged activity for one multiselect field. Deliberately a new child
--      table, NOT a new `scheduled_activities` column — that table IS live
--      in production, so this is a pure ADDITIVE expand (new table, new
--      trailing RPC params with defaults); nothing about its existing shape
--      changes. Stores the chosen OPTION LABELS (`text[]`, encrypted — see
--      below), not option ids: an option can be renamed or removed later
--      without orphaning history, the same "history keeps its own plain-
--      text values" convention `flags`/`quality`/`symptoms` already follow
--      (never an FK array into a mutable vocabulary table).
--
-- Rule 10 — `selected_labels` is exactly as sensitive as `flags`/`quality`/
-- `symptoms`/`sleep_quality` already are (a future multiselect field could
-- easily be another protective-response-shaped checklist), so it gets the
-- same encrypted-bytea-column + Vault-secret + `internal`-schema
-- SECURITY DEFINER encrypt/decrypt pair every other sensitive array on this
-- table already has, not a plain `text[]` column.
--
-- Data-safety judgment call: `update_header_button` used to blindly
-- `DELETE ... note_fields WHERE header_button_id = p_id` then reinsert on
-- every save (fine when nothing else referenced those rows). Now that
-- `scheduled_activity_field_selections.note_field_id` is a real FK into
-- `header_button_note_fields.id`, that blind delete+reinsert would silently
-- cascade away a multiselect field's entire selection history on every
-- unrelated edit to the SAME button (e.g. renaming "Type"). Fixed below:
-- an existing field is matched and updated BY ID when the client sends one
-- back (mirroring how `update_header_button` already preserves a checklist
-- item's `item_key` rather than re-deriving it); `field_kind` itself is
-- immutable per field once created (same "fixed at creation" treatment
-- category/activity_id/key/day_value_unit already get) — only its label and
-- (for multiselect) its options can change. A field dropped from the
-- payload is only actually deleted if NOTHING references it yet
-- (`scheduled_activity_field_selections`); one with real history is left in
-- place rather than silently destroying that history — the same
-- never-hard-delete-what-has-history posture `header_buttons` itself
-- already takes for the whole button.
--
-- `sleep_quality_encrypted`/`quick_log_sleep_quality`: `scheduled_activities`
-- IS live in production, so its `sleep_quality_encrypted` column is only
-- DEPRECATED here (comment + client stops writing new data into it), never
-- dropped in the same pass that stops needing it — WORKFLOW.md's own
-- expand-contract rule, applied to this column exactly like every other
-- destructive change in this schema. A follow-up migration drops it once a
-- release has actually shipped without any code path still writing it.
-- `header_buttons.quick_log_sleep_quality`, by contrast, is dropped OUTRIGHT
-- below — that whole table is pre-release (nothing in production reads it
-- yet), so there is no rollout window to protect.

-- ===========================================================================
-- 1. header_button_note_fields: field_kind + header_button_field_options.
-- ===========================================================================
alter table public.header_button_note_fields
  add column field_kind text not null default 'text' check (field_kind in ('text', 'multiselect'));

-- The old CHECK forced every field to have a 'primary'/'secondary' key.
-- Widen it to only apply to 'text' fields — a multiselect field's `key` is
-- irrelevant (nothing physical to slot it into) and stays null; Postgres
-- already treats multiple NULLs as non-conflicting under the existing
-- `unique (header_button_id, field_key)` constraint, so any number of
-- multiselect fields can coexist on one button with no further change there.
alter table public.header_button_note_fields drop constraint header_button_note_fields_field_key_check;
alter table public.header_button_note_fields alter column field_key drop not null;
alter table public.header_button_note_fields add constraint header_button_note_fields_field_key_check check (
  field_kind <> 'text' or field_key in ('primary', 'secondary')
);

create table public.header_button_field_options (
  id uuid primary key default gen_random_uuid(),
  note_field_id uuid not null references public.header_button_note_fields (id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0
);

alter table public.header_button_field_options enable row level security;

create policy "read own header button field options"
  on public.header_button_field_options for select to authenticated
  using (exists (
    select 1 from public.header_button_note_fields nf
    join public.header_buttons hb on hb.id = nf.header_button_id
    where nf.id = note_field_id and hb.created_by = (select auth.uid())
  ));
create policy "write own header button field options"
  on public.header_button_field_options for all to authenticated
  using (exists (
    select 1 from public.header_button_note_fields nf
    join public.header_buttons hb on hb.id = nf.header_button_id
    where nf.id = note_field_id and hb.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.header_button_note_fields nf
    join public.header_buttons hb on hb.id = nf.header_button_id
    where nf.id = note_field_id and hb.created_by = (select auth.uid())
  ));

-- Pre-release column — no expand-contract needed, nothing in production
-- reads it yet (see the top-of-file note).
alter table public.header_buttons drop column quick_log_sleep_quality;

-- ===========================================================================
-- 2. scheduled_activity_field_selections — encrypted, rule 10.
-- ===========================================================================
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activity_field_selections_key',
  'Symmetric key for encrypting scheduled_activity_field_selections.selected_labels_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activity_field_selections_key'
);

create function internal.encrypt_field_selections(selected_labels text[])
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when selected_labels is null or array_length(selected_labels, 1) is null then null
    else extensions.pgp_sym_encrypt(
      array_to_string(selected_labels, chr(31)),
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activity_field_selections_key')
    )
  end
$$;

create function internal.decrypt_field_selections(encrypted bytea)
returns text[]
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then '{}'::text[]
    else string_to_array(
      extensions.pgp_sym_decrypt(
        encrypted,
        (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activity_field_selections_key')
      ),
      chr(31)
    )
  end
$$;

revoke all on function internal.encrypt_field_selections(text[]) from public, anon, authenticated;
revoke all on function internal.decrypt_field_selections(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_field_selections(text[]) to authenticated, service_role;
grant execute on function internal.decrypt_field_selections(bytea) to authenticated, service_role;

-- A comma-join (used elsewhere in this file group for flags/quality/
-- symptoms/sleep_quality) would silently corrupt a label that itself
-- contains a comma — a real risk here since these are user-typed option
-- labels, not a fixed enum. `chr(31)` (ASCII Unit Separator) is not typeable
-- through any UI input in this app, so it's used as the join/split delimiter
-- instead — this table's own choice, not a retroactive fix to the older
-- comma-joined columns (out of scope for this migration).

create table public.scheduled_activity_field_selections (
  id uuid primary key default gen_random_uuid(),
  scheduled_activity_id uuid not null references public.scheduled_activities (id) on delete cascade,
  note_field_id uuid not null references public.header_button_note_fields (id),
  selected_labels_encrypted bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheduled_activity_id, note_field_id)
);

create index scheduled_activity_field_selections_activity_idx
  on public.scheduled_activity_field_selections (scheduled_activity_id);

create or replace function public.set_scheduled_activity_field_selections_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scheduled_activity_field_selections_set_updated_at
  before update on public.scheduled_activity_field_selections
  for each row execute function public.set_scheduled_activity_field_selections_updated_at();

alter table public.scheduled_activity_field_selections enable row level security;

create policy "read own field selections"
  on public.scheduled_activity_field_selections for select to authenticated
  using (exists (
    select 1 from public.scheduled_activities sa
    where sa.id = scheduled_activity_id and sa.user_id = (select auth.uid())
  ));
create policy "write own field selections"
  on public.scheduled_activity_field_selections for all to authenticated
  using (exists (
    select 1 from public.scheduled_activities sa
    where sa.id = scheduled_activity_id and sa.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.scheduled_activities sa
    where sa.id = scheduled_activity_id and sa.user_id = (select auth.uid())
  ));

-- ===========================================================================
-- 3. Seed forward: give every user's provisioned Sleep button the new
--    multiselect field, replacing the old boolean flag's capability.
-- ===========================================================================
create or replace function public.provision_default_header_buttons()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_sleep_button_id uuid;
  v_sleep_quality_field_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.header_buttons where created_by = v_user) then
    return;
  end if;

  insert into public.header_buttons (created_by, category, key, label, sort_order) values
    (v_user, 'notes', 'gifts', 'Extra Senses', 0),
    (v_user, 'notes', 'learnings', 'Learnings', 1),
    (v_user, 'notes', 'mirror', 'Relational Nutrient', 2),
    (v_user, 'notes', 'scriptures', 'Scriptures', 3);

  insert into public.header_button_note_types (header_button_id, value, sort_order)
  select hb.id, v.value, v.ord
  from public.header_buttons hb
  join (values
    ('gifts', 'Dreamer', 0), ('gifts', 'The Voice', 1), ('gifts', 'The Knower', 2),
    ('gifts', 'Memory Bank', 3), ('gifts', 'Amplifier', 4),
    ('learnings', 'Given', 0), ('learnings', 'Realized', 1), ('learnings', 'Revealed', 2)
  ) as v(key, value, ord) on v.key = hb.key
  where hb.created_by = v_user and hb.category = 'notes';

  insert into public.header_buttons (
    created_by, category, label, sort_order, activity_id, entry_mode, quick_log_type, quick_log_type_label
  )
  select v_user, 'activity', v.label, v.sort_order, a.id, v.entry_mode, v.quick_log_type, v.quick_log_type_label
  from (values
    ('Vipassana', 4, 'Vipassana', 'duration', false, null::text),
    ('Sports or Exercise', 6, 'Exercise', 'duration', true, 'Type'),
    ('Breathwork', 7, 'Breathing', 'duration', true, 'Type'),
    ('Sleep', 8, 'Sleep', 'duration', true, 'Sleep type'),
    ('Prayer', 9, 'Prayer', 'duration', true, 'Type'),
    ('Sermons', 10, 'Sermons', 'duration', false, null::text),
    ('Worship', 11, 'Worship', 'song_count', false, null::text)
  ) as v(activity_name, sort_order, label, entry_mode, quick_log_type, quick_log_type_label)
  join public.activities a on a.name = v.activity_name and a.parent_id is null;

  insert into public.header_button_note_fields (header_button_id, field_key, field_kind, label, sort_order)
  select hb.id, 'primary', 'text', 'Note', 0
  from public.header_buttons hb
  join public.activities a on a.id = hb.activity_id
  where hb.created_by = v_user and hb.category = 'activity' and a.name <> 'Vipassana';

  insert into public.header_button_note_fields (header_button_id, field_key, field_kind, label, sort_order)
  select hb.id, 'secondary', 'text', 'Dreams', 1
  from public.header_buttons hb
  join public.activities a on a.id = hb.activity_id
  where hb.created_by = v_user and hb.category = 'activity' and a.name = 'Sleep'
  returning header_button_id into v_sleep_button_id;

  -- The generalized "How was your sleep?" multiselect — replaces the old
  -- `quick_log_sleep_quality` boolean special case. Same 11 values, same
  -- order, now ordinary user-editable options rather than a hardcoded
  -- client-side enum.
  select hb.id into v_sleep_button_id
  from public.header_buttons hb
  join public.activities a on a.id = hb.activity_id
  where hb.created_by = v_user and hb.category = 'activity' and a.name = 'Sleep';

  insert into public.header_button_note_fields (header_button_id, field_key, field_kind, label, sort_order)
  values (v_sleep_button_id, null, 'multiselect', 'How was your sleep?', 2)
  returning id into v_sleep_quality_field_id;

  insert into public.header_button_field_options (note_field_id, label, sort_order)
  select v_sleep_quality_field_id, v.label, v.ord
  from (values
    ('Deep Restorative', 0), ('Light & Restful', 1), ('Light & Restless', 2), ('Fragmented', 3),
    ('Interrupted', 4), ('Long but Unrefreshing', 5), ('Short but Restorative', 6), ('Dream-Intense', 7),
    ('Delayed', 8), ('Early Awakening', 9), ('Unusually Deep', 10)
  ) as v(label, ord);

  insert into public.header_buttons (created_by, category, key, label, sort_order, day_value_unit, day_value_target) values
    (v_user, 'day_value', 'steps', 'Steps', 5, 'int', null),
    (v_user, 'day_value', 'protein', 'Protein', 12, 'target', 80);

  insert into public.header_buttons (created_by, category, label, sort_order) values (v_user, 'checklist', 'Supplements', 13);

  insert into public.header_button_checklist_items (header_button_id, item_key, label, sort_order)
  select hb.id, v.item_key, v.label, v.ord
  from public.header_buttons hb
  join (values
    ('zinc', 'Zinc (post-breakfast)', 0),
    ('omega', 'Omega (post-lunch)', 1),
    ('magnesium', 'Magnesium (post-dinner)', 2),
    ('ayurveda_skin', 'Ayurveda — skin healing', 3),
    ('ayurveda_fibroid', 'Ayurveda — fibroid healing', 4),
    ('ayurveda_varicose', 'Ayurveda — varicose veins', 5),
    ('multivitamin', 'MultiVitamin (on Chums days)', 6)
  ) as v(item_key, label, ord) on true
  where hb.created_by = v_user and hb.category = 'checklist' and hb.label = 'Supplements';
end;
$$;

-- Seed-shape sanity check — mirrors the original seed migration's own
-- verification pattern, run against a throwaway user so it never touches
-- real data.
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_field_count integer;
  v_option_count integer;
begin
  insert into auth.users (id) values (v_probe);
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.provision_default_header_buttons();

  select count(*) into v_field_count
  from public.header_button_note_fields nf
  join public.header_buttons hb on hb.id = nf.header_button_id
  where hb.created_by = v_probe and hb.label = 'Sleep' and nf.field_kind = 'multiselect';

  if v_field_count <> 1 then
    raise exception 'provisioning seed check: expected exactly 1 multiselect field on Sleep, got %', v_field_count;
  end if;

  select count(*) into v_option_count
  from public.header_button_field_options fo
  join public.header_button_note_fields nf on nf.id = fo.note_field_id
  join public.header_buttons hb on hb.id = nf.header_button_id
  where hb.created_by = v_probe and hb.label = 'Sleep' and nf.field_kind = 'multiselect';

  if v_option_count <> 11 then
    raise exception 'provisioning seed check: expected 11 sleep-quality options, got %', v_option_count;
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.header_buttons where created_by = v_probe;
  delete from auth.users where id = v_probe;
end $$;

-- ===========================================================================
-- 4. create_header_button / update_header_button — richer p_note_fields
--    shape: [{id?, fieldKind, key?, label, options?}]. `id` (update only)
--    preserves an existing multiselect field's identity — see the top-of-
--    file note on why that matters now. `fieldKind` is set at creation and
--    never changes on update.
-- ===========================================================================
create or replace function public.create_header_button(
  p_category text,
  p_label text,
  p_id uuid default null,
  p_key text default null,
  p_activity_id uuid default null,
  p_entry_mode text default 'duration',
  p_quick_log_type boolean default false,
  p_quick_log_type_label text default null,
  p_day_value_unit text default null,
  p_day_value_target numeric default null,
  p_note_fields jsonb default '[]'::jsonb,
  p_note_types jsonb default '[]'::jsonb,
  p_checklist_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_sort_order integer;
  v_item jsonb;
  v_item_key text;
  v_seen text[] := '{}';
  v_inserted boolean := false;
  v_field jsonb;
  v_field_id uuid;
  v_field_kind text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_category not in ('activity', 'checklist', 'notes', 'day_value') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  if p_category = 'activity' then
    if p_activity_id is null then
      raise exception 'activity_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.activities where id = p_activity_id and parent_id is null) then
      raise exception 'invalid_activity' using errcode = '22023';
    end if;
    if p_entry_mode not in ('duration', 'song_count') then
      raise exception 'invalid_entry_mode' using errcode = '22023';
    end if;
    v_key := null;
  elsif p_category = 'day_value' then
    if p_day_value_unit not in ('min', 'int', 'target') then
      raise exception 'invalid_day_value_unit' using errcode = '22023';
    end if;
    if p_day_value_unit = 'target' and p_day_value_target is null then
      raise exception 'target_required' using errcode = '22023';
    end if;
    if v_key is null then
      v_key := 'user_' || replace(gen_random_uuid()::text, '-', '');
    end if;
  elsif p_category = 'notes' then
    if v_key is null then
      v_key := 'user_' || replace(gen_random_uuid()::text, '-', '');
    end if;
  else
    v_key := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from public.header_buttons
  where created_by = auth.uid();

  insert into public.header_buttons (
    id, created_by, category, key, label, sort_order, activity_id, entry_mode,
    quick_log_type, quick_log_type_label, day_value_unit, day_value_target
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_category, v_key, btrim(p_label), v_sort_order, p_activity_id,
    coalesce(p_entry_mode, 'duration'), coalesce(p_quick_log_type, false), p_quick_log_type_label,
    p_day_value_unit, p_day_value_target
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    if p_id is not null then
      select id into v_id from public.header_buttons where id = p_id and created_by = auth.uid();
    end if;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'create_header_button_failed' using errcode = 'P0001';
  end if;

  if p_category = 'activity' then
    for v_field in select * from jsonb_array_elements(coalesce(p_note_fields, '[]'::jsonb))
    loop
      v_field_kind := case when (v_field ->> 'fieldKind') = 'multiselect' then 'multiselect' else 'text' end;
      if btrim(coalesce(v_field ->> 'label', '')) = '' then
        continue;
      end if;
      if v_field_kind = 'text' and (v_field ->> 'key') not in ('primary', 'secondary') then
        continue;
      end if;

      insert into public.header_button_note_fields (header_button_id, field_key, field_kind, label, sort_order)
      values (
        v_id,
        case when v_field_kind = 'text' then (v_field ->> 'key') else null end,
        v_field_kind,
        btrim(v_field ->> 'label'),
        0
      )
      returning id into v_field_id;

      if v_field_kind = 'multiselect' then
        insert into public.header_button_field_options (note_field_id, label, sort_order)
        select v_field_id, btrim(opt), o - 1
        from jsonb_array_elements_text(coalesce(v_field -> 'options', '[]'::jsonb)) with ordinality as t (opt, o)
        where btrim(opt) <> '';
      end if;
    end loop;
  end if;

  if p_category = 'notes' then
    insert into public.header_button_note_types (header_button_id, value, sort_order)
    select v_id, btrim(elem), ord - 1
    from jsonb_array_elements_text(coalesce(p_note_types, '[]'::jsonb)) with ordinality as t (elem, ord)
    where btrim(elem) <> '';
  end if;

  if p_category = 'checklist' then
    for v_item in select * from jsonb_array_elements(coalesce(p_checklist_items, '[]'::jsonb))
    loop
      v_item_key := lower(regexp_replace(btrim(coalesce(v_item ->> 'label', '')), '[^a-zA-Z0-9]+', '_', 'g'));
      v_item_key := trim(both '_' from v_item_key);
      if v_item_key = '' then
        continue;
      end if;
      if v_item_key = any (v_seen) then
        v_item_key := v_item_key || '_' || substr(md5(random()::text), 1, 4);
      end if;
      v_seen := array_append(v_seen, v_item_key);
      insert into public.header_button_checklist_items (header_button_id, item_key, label, sort_order)
      values (v_id, v_item_key, btrim(v_item ->> 'label'), array_length(v_seen, 1) - 1);
      v_inserted := true;
    end loop;
    if not v_inserted then
      raise exception 'checklist_items_required' using errcode = '22023';
    end if;
  end if;

  return v_id;
end;
$$;

drop function if exists public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, boolean, text, numeric, jsonb, jsonb, jsonb
);

revoke all on function public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, text, numeric, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.create_header_button(
  text, text, uuid, text, uuid, text, boolean, text, text, numeric, jsonb, jsonb, jsonb
) to authenticated;

create or replace function public.update_header_button(
  p_id uuid,
  p_label text,
  p_quick_log_type_label text default null,
  p_day_value_target numeric default null,
  p_note_fields jsonb default null,
  p_note_types jsonb default null,
  p_checklist_items jsonb default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.header_buttons;
  v_item jsonb;
  v_item_key text;
  v_seen text[] := '{}';
  v_field jsonb;
  v_field_id uuid;
  v_field_kind text;
  v_seen_field_ids uuid[] := '{}';
  v_existing_field record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from public.header_buttons where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'header_button_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;

  update public.header_buttons set
    label = btrim(p_label),
    quick_log_type_label = case when v_row.category = 'activity' then coalesce(p_quick_log_type_label, quick_log_type_label) else quick_log_type_label end,
    day_value_target = case when v_row.category = 'day_value' then coalesce(p_day_value_target, day_value_target) else day_value_target end
  where id = p_id;

  if v_row.category = 'activity' and p_note_fields is not null then
    for v_field in select * from jsonb_array_elements(p_note_fields)
    loop
      if btrim(coalesce(v_field ->> 'label', '')) = '' then
        continue;
      end if;

      v_field_id := nullif(v_field ->> 'id', '')::uuid;
      select id, field_kind into v_existing_field
      from public.header_button_note_fields
      where id = v_field_id and header_button_id = p_id;

      if found then
        -- Existing field: label (and, for multiselect, options) may change;
        -- field_kind never does.
        update public.header_button_note_fields set label = btrim(v_field ->> 'label')
        where id = v_field_id;

        if v_existing_field.field_kind = 'multiselect' then
          delete from public.header_button_field_options where note_field_id = v_field_id;
          insert into public.header_button_field_options (note_field_id, label, sort_order)
          select v_field_id, btrim(opt), o - 1
          from jsonb_array_elements_text(coalesce(v_field -> 'options', '[]'::jsonb)) with ordinality as t (opt, o)
          where btrim(opt) <> '';
        end if;

        v_seen_field_ids := array_append(v_seen_field_ids, v_field_id);
      else
        -- New field.
        v_field_kind := case when (v_field ->> 'fieldKind') = 'multiselect' then 'multiselect' else 'text' end;
        if v_field_kind = 'text' and (v_field ->> 'key') not in ('primary', 'secondary') then
          continue;
        end if;

        insert into public.header_button_note_fields (header_button_id, field_key, field_kind, label, sort_order)
        values (
          p_id,
          case when v_field_kind = 'text' then (v_field ->> 'key') else null end,
          v_field_kind,
          btrim(v_field ->> 'label'),
          0
        )
        returning id into v_field_id;

        if v_field_kind = 'multiselect' then
          insert into public.header_button_field_options (note_field_id, label, sort_order)
          select v_field_id, btrim(opt), o - 1
          from jsonb_array_elements_text(coalesce(v_field -> 'options', '[]'::jsonb)) with ordinality as t (opt, o)
          where btrim(opt) <> '';
        end if;

        v_seen_field_ids := array_append(v_seen_field_ids, v_field_id);
      end if;
    end loop;

    -- Fields dropped from the payload: only actually removed if nothing
    -- references them yet (see the top-of-file note) — a field with real
    -- selection history is left in place rather than silently destroying it.
    delete from public.header_button_note_fields nf
    where nf.header_button_id = p_id
      and not (nf.id = any (v_seen_field_ids))
      and not exists (
        select 1 from public.scheduled_activity_field_selections s where s.note_field_id = nf.id
      );
  end if;

  if v_row.category = 'notes' and p_note_types is not null then
    delete from public.header_button_note_types where header_button_id = p_id;
    insert into public.header_button_note_types (header_button_id, value, sort_order)
    select p_id, btrim(elem), ord - 1
    from jsonb_array_elements_text(p_note_types) with ordinality as t (elem, ord)
    where btrim(elem) <> '';
  end if;

  if v_row.category = 'checklist' and p_checklist_items is not null then
    delete from public.header_button_checklist_items where header_button_id = p_id;
    for v_item in select * from jsonb_array_elements(p_checklist_items)
    loop
      v_item_key := nullif(btrim(coalesce(v_item ->> 'key', '')), '');
      if v_item_key is null then
        v_item_key := lower(regexp_replace(btrim(coalesce(v_item ->> 'label', '')), '[^a-zA-Z0-9]+', '_', 'g'));
        v_item_key := trim(both '_' from v_item_key);
      end if;
      if v_item_key = '' or v_item_key is null then
        continue;
      end if;
      if v_item_key = any (v_seen) then
        v_item_key := v_item_key || '_' || substr(md5(random()::text), 1, 4);
      end if;
      v_seen := array_append(v_seen, v_item_key);
      insert into public.header_button_checklist_items (header_button_id, item_key, label, sort_order)
      values (p_id, v_item_key, btrim(v_item ->> 'label'), array_length(v_seen, 1) - 1);
    end loop;
    if array_length(v_seen, 1) is null then
      raise exception 'checklist_items_required' using errcode = '22023';
    end if;
  end if;
end;
$$;

drop function if exists public.update_header_button(uuid, text, text, boolean, numeric, jsonb, jsonb, jsonb);

revoke all on function public.update_header_button(uuid, text, text, numeric, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_header_button(uuid, text, text, numeric, jsonb, jsonb, jsonb) to authenticated;

-- ===========================================================================
-- 5. list_header_buttons() — note_fields now carry id/fieldKind/options.
-- ===========================================================================
drop function if exists public.list_header_buttons();

create or replace function public.list_header_buttons()
returns table (
  id uuid,
  category text,
  key text,
  label text,
  sort_order numeric,
  hidden boolean,
  activity_id uuid,
  activity_name text,
  entry_mode text,
  quick_log_type boolean,
  quick_log_type_label text,
  day_value_unit text,
  day_value_target numeric,
  note_fields jsonb,
  note_types jsonb,
  checklist_items jsonb
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    hb.id,
    hb.category,
    hb.key,
    hb.label,
    coalesce(us.sort_order, hb.sort_order)::numeric as sort_order,
    coalesce(us.hidden, false) as hidden,
    hb.activity_id,
    a.name as activity_name,
    hb.entry_mode,
    hb.quick_log_type,
    hb.quick_log_type_label,
    hb.day_value_unit,
    hb.day_value_target,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', nf.id,
        'fieldKind', nf.field_kind,
        'key', nf.field_key,
        'label', nf.label,
        'options', coalesce((
          select jsonb_agg(fo.label order by fo.sort_order)
          from public.header_button_field_options fo
          where fo.note_field_id = nf.id
        ), '[]'::jsonb)
      ) order by nf.sort_order)
      from public.header_button_note_fields nf where nf.header_button_id = hb.id
    ), '[]'::jsonb) as note_fields,
    coalesce((
      select jsonb_agg(nt.value order by nt.sort_order)
      from public.header_button_note_types nt where nt.header_button_id = hb.id
    ), '[]'::jsonb) as note_types,
    coalesce((
      select jsonb_agg(jsonb_build_object('key', ci.item_key, 'label', ci.label) order by ci.sort_order)
      from public.header_button_checklist_items ci where ci.header_button_id = hb.id
    ), '[]'::jsonb) as checklist_items
  from public.header_buttons hb
  left join public.activities a on a.id = hb.activity_id
  left join public.header_button_user_state us on us.header_button_id = hb.id and us.user_id = auth.uid()
  where hb.created_by = auth.uid()
  order by coalesce(us.hidden, false), coalesce(us.sort_order, hb.sort_order), hb.created_at;
$$;

revoke all on function public.list_header_buttons() from public, anon;
grant execute on function public.list_header_buttons() to authenticated;

-- ===========================================================================
-- 6. scheduled_activities: field_selections through create/reschedule +
--    the DTO, plus a standalone setter for parity (mirrors every other
--    field's own standalone setter). Purely additive — every new param has
--    a default, and `sleep_quality_encrypted`/`set_scheduled_activity_
--    sleep_quality` are UNTOUCHED (deprecated, not removed — see top-of-
--    file note).
-- ===========================================================================
comment on column public.scheduled_activities.sleep_quality_encrypted is
  'DEPRECATED — superseded by scheduled_activity_field_selections (the generic multiselect-field mechanism). Kept for one more release per WORKFLOW.md''s expand-contract rule; a follow-up migration drops it once no code path still writes it. See 20260921060000_dynamic_note_fields.sql.';

drop type if exists public.scheduled_activity_dto cascade;

create type public.field_selection_entry as (
  note_field_id uuid,
  selected_labels text[]
);

create type public.scheduled_activity_dto as (
  id uuid,
  activity_id uuid,
  path text[],
  start_at timestamptz,
  duration_minutes integer,
  local_date date,
  start_minute smallint,
  timezone text,
  flags text[],
  quality text[],
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  symptoms text[],
  notes text,
  reflections public.reflection_entry[],
  sleep_quality text[],
  dreams text,
  field_selections public.field_selection_entry[]
);

create or replace function public.to_scheduled_activity_dto(r public.scheduled_activities)
returns public.scheduled_activity_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(
    r.id, r.activity_id, r.path, r.start_at, r.duration_minutes, r.local_date,
    r.start_minute, r.timezone, internal.decrypt_flags(r.flags_encrypted),
    internal.decrypt_quality(r.quality_encrypted), r.status,
    r.created_at, r.updated_at,
    internal.decrypt_symptoms(r.symptoms_encrypted), internal.decrypt_notes(r.notes_encrypted),
    (
      select coalesce(
        array_agg(
          row(sar.reflection_card_id, internal.decrypt_reflection_note(sar.note_encrypted))::public.reflection_entry
          order by sar.created_at
        ),
        array[]::public.reflection_entry[]
      )
      from public.scheduled_activity_reflections sar
      where sar.scheduled_activity_id = r.id
    ),
    internal.decrypt_sleep_quality(r.sleep_quality_encrypted),
    internal.decrypt_dreams(r.dreams_encrypted),
    (
      select coalesce(
        array_agg(
          row(sfs.note_field_id, internal.decrypt_field_selections(sfs.selected_labels_encrypted))::public.field_selection_entry
          order by sfs.created_at
        ),
        array[]::public.field_selection_entry[]
      )
      from public.scheduled_activity_field_selections sfs
      where sfs.scheduled_activity_id = r.id
    )
  )::public.scheduled_activity_dto
$$;

create or replace function public.list_scheduled_activities(
  p_range_start timestamptz,
  p_range_end timestamptz
) returns setof public.scheduled_activity_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select public.to_scheduled_activity_dto(s)
  from public.scheduled_activities s
  where s.user_id = auth.uid()
    and s.deleted_at is null
    and s.start_at < p_range_end
    and s.end_at > p_range_start
  order by s.start_at;
$$;

-- Shared by create/reschedule below: validates + writes one activity's
-- field selections wholesale (delete+reinsert — nothing downstream
-- references a selection ROW's own id, only the scheduled_activity_id +
-- note_field_id pair, so this is always safe to fully replace).
create or replace function internal.write_scheduled_activity_field_selections(
  p_scheduled_activity_id uuid,
  p_field_selections jsonb
) returns void
language plpgsql
set search_path = public, internal, pg_temp
as $$
declare
  v_entry jsonb;
  v_note_field_id uuid;
  v_labels text[];
begin
  delete from public.scheduled_activity_field_selections where scheduled_activity_id = p_scheduled_activity_id;

  for v_entry in select * from jsonb_array_elements(coalesce(p_field_selections, '[]'::jsonb))
  loop
    v_note_field_id := nullif(v_entry ->> 'note_field_id', '')::uuid;
    if v_note_field_id is null then
      continue;
    end if;

    -- Defense in depth: only a multiselect field the caller actually owns
    -- (via their own header_buttons) may receive a selection.
    if not exists (
      select 1
      from public.header_button_note_fields nf
      join public.header_buttons hb on hb.id = nf.header_button_id
      where nf.id = v_note_field_id and nf.field_kind = 'multiselect' and hb.created_by = auth.uid()
    ) then
      continue;
    end if;

    select array_agg(btrim(elem)) into v_labels
    from jsonb_array_elements_text(coalesce(v_entry -> 'selected_labels', '[]'::jsonb)) as elem
    where btrim(elem) <> '';

    if v_labels is null or array_length(v_labels, 1) is null then
      continue;
    end if;

    insert into public.scheduled_activity_field_selections (scheduled_activity_id, note_field_id, selected_labels_encrypted)
    values (p_scheduled_activity_id, v_note_field_id, internal.encrypt_field_selections(v_labels));
  end loop;
end;
$$;

revoke all on function internal.write_scheduled_activity_field_selections(uuid, jsonb) from public, anon, authenticated;
grant execute on function internal.write_scheduled_activity_field_selections(uuid, jsonb) to authenticated, service_role;

create or replace function public.create_scheduled_activity(
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_flags text[] default '{}',
  p_id uuid default null,
  p_quality text[] default '{}',
  p_symptoms text[] default '{}',
  p_notes text default null,
  p_reflections jsonb default '[]'::jsonb,
  p_sleep_quality text[] default '{}',
  p_dreams text default null,
  p_field_selections jsonb default '[]'::jsonb
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform internal.assert_valid_quality(p_quality);
  perform internal.assert_valid_symptoms(p_symptoms);
  perform internal.assert_valid_sleep_quality(p_sleep_quality);

  if p_duration_minutes > 0 then
    v_ceiling := public.scheduling_ceiling(auth.uid(), p_start_at, null);
    if p_duration_minutes > v_ceiling then
      raise exception 'schedule_conflict: % minutes requested, % available', p_duration_minutes, v_ceiling
        using errcode = 'P0001', detail = v_ceiling::text;
    end if;
  end if;

  insert into public.scheduled_activities (
    id, user_id, activity_id, path, start_at, end_at, duration_minutes,
    local_date, start_minute, timezone, flags_encrypted, quality_encrypted, status,
    symptoms_encrypted, notes_encrypted, sleep_quality_encrypted, dreams_encrypted
  ) values (
    coalesce(p_id, gen_random_uuid()), auth.uid(), p_activity_id, coalesce(p_path, '{}'), p_start_at,
    p_start_at + make_interval(mins => p_duration_minutes), p_duration_minutes,
    p_local_date, p_start_minute, p_timezone, internal.encrypt_flags(p_flags),
    internal.encrypt_quality(p_quality), 'planned',
    internal.encrypt_symptoms(p_symptoms), internal.encrypt_notes(p_notes),
    internal.encrypt_sleep_quality(p_sleep_quality), internal.encrypt_dreams(p_dreams)
  )
  on conflict (id) do update set
    activity_id = excluded.activity_id,
    path = excluded.path,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    duration_minutes = excluded.duration_minutes,
    local_date = excluded.local_date,
    start_minute = excluded.start_minute,
    timezone = excluded.timezone,
    flags_encrypted = excluded.flags_encrypted,
    quality_encrypted = excluded.quality_encrypted,
    symptoms_encrypted = excluded.symptoms_encrypted,
    notes_encrypted = excluded.notes_encrypted,
    sleep_quality_encrypted = excluded.sleep_quality_encrypted,
    dreams_encrypted = excluded.dreams_encrypted
  where public.scheduled_activities.user_id = auth.uid()
  returning * into v_row;

  delete from public.scheduled_activity_reflections where scheduled_activity_id = v_row.id;
  insert into public.scheduled_activity_reflections (scheduled_activity_id, reflection_card_id, note_encrypted)
  select
    v_row.id,
    rc.id,
    internal.encrypt_reflection_note(nullif(btrim(elem ->> 'note'), ''))
  from jsonb_array_elements(coalesce(p_reflections, '[]'::jsonb)) as elem
  join public.reflection_cards rc
    on rc.id = (elem ->> 'card_id')::uuid
   and (rc.created_by is null or rc.created_by = auth.uid());

  perform internal.write_scheduled_activity_field_selections(v_row.id, p_field_selections);

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb, text[], text, jsonb) from public, anon;
grant execute on function public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb, text[], text, jsonb) to authenticated;
drop function if exists public.create_scheduled_activity(uuid, text[], timestamptz, integer, date, smallint, text, text[], uuid, text[], text[], text, jsonb, text[], text);

create or replace function public.reschedule_scheduled_activity(
  p_id uuid,
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_quality text[] default '{}',
  p_symptoms text[] default '{}',
  p_notes text default null,
  p_reflections jsonb default '[]'::jsonb,
  p_sleep_quality text[] default '{}',
  p_dreams text default null,
  p_field_selections jsonb default '[]'::jsonb
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_quality(p_quality);
  perform internal.assert_valid_symptoms(p_symptoms);
  perform internal.assert_valid_sleep_quality(p_sleep_quality);

  if p_duration_minutes > 0 then
    v_ceiling := public.scheduling_ceiling(auth.uid(), p_start_at, p_id);
    if p_duration_minutes > v_ceiling then
      raise exception 'schedule_conflict: % minutes requested, % available', p_duration_minutes, v_ceiling
        using errcode = 'P0001', detail = v_ceiling::text;
    end if;
  end if;

  update public.scheduled_activities set
    activity_id = p_activity_id,
    path = coalesce(p_path, '{}'),
    start_at = p_start_at,
    end_at = p_start_at + make_interval(mins => p_duration_minutes),
    duration_minutes = p_duration_minutes,
    local_date = p_local_date,
    start_minute = p_start_minute,
    timezone = p_timezone,
    quality_encrypted = internal.encrypt_quality(p_quality),
    symptoms_encrypted = internal.encrypt_symptoms(p_symptoms),
    notes_encrypted = internal.encrypt_notes(p_notes),
    sleep_quality_encrypted = internal.encrypt_sleep_quality(p_sleep_quality),
    dreams_encrypted = internal.encrypt_dreams(p_dreams)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  delete from public.scheduled_activity_reflections where scheduled_activity_id = v_row.id;
  insert into public.scheduled_activity_reflections (scheduled_activity_id, reflection_card_id, note_encrypted)
  select
    v_row.id,
    rc.id,
    internal.encrypt_reflection_note(nullif(btrim(elem ->> 'note'), ''))
  from jsonb_array_elements(coalesce(p_reflections, '[]'::jsonb)) as elem
  join public.reflection_cards rc
    on rc.id = (elem ->> 'card_id')::uuid
   and (rc.created_by is null or rc.created_by = auth.uid());

  perform internal.write_scheduled_activity_field_selections(v_row.id, p_field_selections);

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb, text[], text, jsonb) from public, anon;
grant execute on function public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb, text[], text, jsonb) to authenticated;
drop function if exists public.reschedule_scheduled_activity(uuid, uuid, text[], timestamptz, integer, date, smallint, text, text[], text[], text, jsonb, text[], text);

create or replace function public.set_scheduled_activity_status(
  p_id uuid,
  p_status text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  if p_status not in ('planned', 'completed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.scheduled_activities set status = p_status
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_flags(
  p_id uuid,
  p_flags text[]
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  update public.scheduled_activities set flags_encrypted = internal.encrypt_flags(p_flags)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_quality(
  p_id uuid,
  p_quality text[]
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_quality(p_quality);

  update public.scheduled_activities set quality_encrypted = internal.encrypt_quality(p_quality)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_symptoms(
  p_id uuid,
  p_symptoms text[]
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_symptoms(p_symptoms);

  update public.scheduled_activities set symptoms_encrypted = internal.encrypt_symptoms(p_symptoms)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_notes(
  p_id uuid,
  p_notes text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  update public.scheduled_activities set notes_encrypted = internal.encrypt_notes(p_notes)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_reflections(
  p_id uuid,
  p_reflections jsonb
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  select * into v_row
  from public.scheduled_activities
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  delete from public.scheduled_activity_reflections where scheduled_activity_id = v_row.id;
  insert into public.scheduled_activity_reflections (scheduled_activity_id, reflection_card_id, note_encrypted)
  select
    v_row.id,
    rc.id,
    internal.encrypt_reflection_note(nullif(btrim(elem ->> 'note'), ''))
  from jsonb_array_elements(coalesce(p_reflections, '[]'::jsonb)) as elem
  join public.reflection_cards rc
    on rc.id = (elem ->> 'card_id')::uuid
   and (rc.created_by is null or rc.created_by = auth.uid());

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_sleep_quality(
  p_id uuid,
  p_sleep_quality text[]
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  perform internal.assert_valid_sleep_quality(p_sleep_quality);

  update public.scheduled_activities set sleep_quality_encrypted = internal.encrypt_sleep_quality(p_sleep_quality)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.set_scheduled_activity_dreams(
  p_id uuid,
  p_dreams text
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  update public.scheduled_activities set dreams_encrypted = internal.encrypt_dreams(p_dreams)
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

create or replace function public.restore_scheduled_activity(p_id uuid)
returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  update public.scheduled_activities set deleted_at = null
  where id = p_id and user_id = auth.uid() and deleted_at is not null
  returning * into v_row;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

-- New — parity with every other field's own standalone setter
-- (`set_scheduled_activity_quality`, etc.), and the one the client actually
-- calls right after `create`/`reschedule` for the common "edit just this
-- field's selections" case.
create or replace function public.set_scheduled_activity_field_selections(
  p_id uuid,
  p_field_selections jsonb
) returns public.scheduled_activity_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.scheduled_activities;
begin
  select * into v_row
  from public.scheduled_activities
  where id = p_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform internal.write_scheduled_activity_field_selections(v_row.id, p_field_selections);

  return public.to_scheduled_activity_dto(v_row);
end;
$$;

revoke all on function public.set_scheduled_activity_status(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_flags(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_quality(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_symptoms(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_notes(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_reflections(uuid, jsonb) from public, anon;
revoke all on function public.set_scheduled_activity_sleep_quality(uuid, text[]) from public, anon;
revoke all on function public.set_scheduled_activity_dreams(uuid, text) from public, anon;
revoke all on function public.set_scheduled_activity_field_selections(uuid, jsonb) from public, anon;
revoke all on function public.restore_scheduled_activity(uuid) from public, anon;
revoke all on function public.list_scheduled_activities(timestamptz, timestamptz) from public, anon;

grant execute on function public.set_scheduled_activity_status(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_flags(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_quality(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_symptoms(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_notes(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_reflections(uuid, jsonb) to authenticated;
grant execute on function public.set_scheduled_activity_sleep_quality(uuid, text[]) to authenticated;
grant execute on function public.set_scheduled_activity_dreams(uuid, text) to authenticated;
grant execute on function public.set_scheduled_activity_field_selections(uuid, jsonb) to authenticated;
grant execute on function public.restore_scheduled_activity(uuid) to authenticated;
grant execute on function public.list_scheduled_activities(timestamptz, timestamptz) to authenticated;

-- ===========================================================================
-- 7. Data migration: any existing scheduled_activities.sleep_quality moves
--    into scheduled_activity_field_selections, pointed at that SAME user's
--    Sleep button's multiselect field (creating it via provisioning if the
--    user somehow has real sleep_quality data but no header_buttons rows
--    yet — a legacy-user edge case this handles defensively rather than
--    assuming every affected user has already been provisioned). Verified
--    against THIS project's real data below: zero scheduled_activities rows
--    exist in mindful-me-test today, so this is confirmed to run as a
--    no-op here — written for correctness against production's real data
--    once this ships there, not for effect in this project.
-- ===========================================================================
do $$
declare
  v_user record;
  v_sleep_field_id uuid;
  v_before_count integer;
  v_migrated_count integer;
begin
  select count(*) into v_before_count
  from public.scheduled_activities
  where sleep_quality_encrypted is not null;

  for v_user in
    select distinct user_id
    from public.scheduled_activities
    where sleep_quality_encrypted is not null
  loop
    -- Ensure this user has been provisioned at all (legacy data predating
    -- the per-user header_buttons model) — provisioning is a no-op if they
    -- already have any buttons of their own.
    perform set_config('request.jwt.claim.sub', v_user.user_id::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.provision_default_header_buttons();
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);

    select nf.id into v_sleep_field_id
    from public.header_button_note_fields nf
    join public.header_buttons hb on hb.id = nf.header_button_id
    join public.activities a on a.id = hb.activity_id
    where hb.created_by = v_user.user_id and hb.category = 'activity' and a.name = 'Sleep' and nf.field_kind = 'multiselect'
    limit 1;

    if v_sleep_field_id is null then
      raise exception 'could not resolve a Sleep multiselect field for user % during sleep_quality migration', v_user.user_id;
    end if;

    -- Decrypt with the OLD column's key, re-encrypt with the NEW table's
    -- own key — these are two different Vault secrets (and even a
    -- different join delimiter: comma vs. chr(31)), so the encrypted bytea
    -- can never be copied directly; it must round-trip through plaintext.
    insert into public.scheduled_activity_field_selections (scheduled_activity_id, note_field_id, selected_labels_encrypted)
    select sa.id, v_sleep_field_id, internal.encrypt_field_selections(internal.decrypt_sleep_quality(sa.sleep_quality_encrypted))
    from public.scheduled_activities sa
    where sa.user_id = v_user.user_id and sa.sleep_quality_encrypted is not null
    on conflict (scheduled_activity_id, note_field_id) do update
      set selected_labels_encrypted = excluded.selected_labels_encrypted;
  end loop;

  select count(*) into v_migrated_count
  from public.scheduled_activity_field_selections sfs
  join public.header_button_note_fields nf on nf.id = sfs.note_field_id
  where nf.field_kind = 'multiselect';

  if v_migrated_count <> v_before_count then
    raise exception 'sleep_quality migration mismatch: % source rows, % migrated', v_before_count, v_migrated_count;
  end if;
end $$;
