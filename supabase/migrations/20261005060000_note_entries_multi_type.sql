-- Free-form note buttons: allow MORE THAN ONE type per note (e.g. Extra
-- Senses: "Dreamer" + "The Voice"). Product rule: a button that defines
-- types still requires at least one; any number may be picked.
--
-- Expand-only (WORKFLOW.md's expand-contract rule) — nothing is renamed,
-- dropped, or re-signatured:
--   * new nullable column `note_entries.gift_types text[]` holds the full
--     selection; the existing `gift_type` column keeps holding the FIRST
--     selected type, so a client build that only knows `gift_type` (still
--     live mid-deploy) keeps reading something sensible;
--   * `note_entry_dto` gains a trailing `entry_types text[]` attribute,
--     always populated (falls back to `[gift_type]` for rows written before
--     this migration / by an old client);
--   * new RPCs `create_note_entry_v2` / `update_note_entry_v2` take the
--     array. The existing `create_note_entry` / `update_note_entry` keep
--     their exact signature and behavior, except that they now also keep
--     `gift_types` in step with the single type they write, so an edit from
--     an old client never leaves a stale multi-selection behind.
--   * the `validate_note_entry` trigger now validates every element of
--     `gift_types` against the button's own vocabulary, and enforces that
--     `gift_type` mirrors its first element.

-- --- Step 1: column + DTO ---------------------------------------------------

alter table public.note_entries add column gift_types text[];

alter table public.note_entries add constraint note_entries_gift_types_nonempty check (
  gift_types is null or cardinality(gift_types) > 0
);

alter type public.note_entry_dto add attribute entry_types text[];

create or replace function public.to_note_entry_dto(r public.note_entries)
returns public.note_entry_dto
language sql
stable
set search_path = public, pg_temp
as $$
  select row(
    r.id, r.button_key, internal.decrypt_note_entry_text(r.note_encrypted), r.gift_type, r.created_at, r.updated_at,
    coalesce(r.gift_types, case when r.gift_type is null then array[]::text[] else array[r.gift_type] end)
  )::public.note_entry_dto
$$;

-- --- Step 2: shared helper — normalize + validate a type selection ----------

-- Dedupes (keeping first-seen order), drops blanks, and checks every value
-- against the button's own `header_button_note_types`. Returns NULL for a
-- button with no type vocabulary (whatever was sent is ignored, same as the
-- single-type RPCs always did). Raises `gift_type_required` when the button
-- has types and none valid was picked, `invalid_gift_type` for an unknown one.
create or replace function internal.normalize_note_entry_types(
  p_button_id uuid,
  p_types text[]
) returns text[]
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_type_count integer;
  v_clean text[];
begin
  select count(*) into v_type_count from public.header_button_note_types where header_button_id = p_button_id;
  if v_type_count = 0 then
    return null;
  end if;

  select coalesce(array_agg(t order by first_pos), array[]::text[]) into v_clean
  from (
    select btrim(t) as t, min(ord) as first_pos
    from unnest(coalesce(p_types, array[]::text[])) with ordinality as u(t, ord)
    where t is not null and btrim(t) <> ''
    group by btrim(t)
  ) s;

  if cardinality(v_clean) = 0 then
    raise exception 'gift_type_required' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_clean) as t
    where not exists (
      select 1 from public.header_button_note_types nt
      where nt.header_button_id = p_button_id and nt.value = t
    )
  ) then
    raise exception 'invalid_gift_type' using errcode = '22023';
  end if;

  return v_clean;
end;
$$;

revoke all on function internal.normalize_note_entry_types(uuid, text[]) from public, anon, authenticated;
grant execute on function internal.normalize_note_entry_types(uuid, text[]) to authenticated, service_role;

-- --- Step 3: trigger validates the array too ---------------------------------

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
  where category = 'notes' and key = new.button_key and created_by = new.user_id
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

  if new.gift_types is not null then
    if v_type_count = 0 then
      raise exception 'gift_type_not_allowed_for_button' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(new.gift_types) as t
      where not exists (
        select 1 from public.header_button_note_types nt where nt.header_button_id = v_button_id and nt.value = t
      )
    ) then
      raise exception 'invalid_gift_type' using errcode = '22023';
    end if;
    if new.gift_type is distinct from new.gift_types[1] then
      raise exception 'gift_type_mismatch' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

-- --- Step 4: old single-type RPCs keep gift_types in step --------------------

create or replace function public.create_note_entry(
  p_button_key text,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return public.create_note_entry_v2(
    p_button_key, p_note, case when p_gift_type is null then null else array[p_gift_type] end
  );
end;
$$;

-- --- Step 5: the new array-taking RPCs ---------------------------------------

create or replace function public.create_note_entry_v2(
  p_button_key text,
  p_note text,
  p_entry_types text[] default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_id uuid;
  v_types text[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_button_id
  from public.header_buttons
  where category = 'notes' and key = p_button_key and created_by = auth.uid()
  limit 1;

  if v_button_id is null then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  v_types := internal.normalize_note_entry_types(v_button_id, p_entry_types);

  insert into public.note_entries (user_id, button_key, note_encrypted, gift_type, gift_types)
  values (auth.uid(), p_button_key, internal.encrypt_note_entry_text(p_note), v_types[1], v_types)
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

create or replace function public.update_note_entry_v2(
  p_id uuid,
  p_note text,
  p_entry_types text[] default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_key text;
  v_button_id uuid;
  v_types text[];
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
  where category = 'notes' and key = v_button_key and created_by = auth.uid()
  limit 1;

  v_types := internal.normalize_note_entry_types(v_button_id, p_entry_types);

  update public.note_entries
  set note_encrypted = internal.encrypt_note_entry_text(p_note),
      gift_type = v_types[1],
      gift_types = v_types
  where id = p_id and user_id = auth.uid() and deleted_at is null
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
begin
  return public.update_note_entry_v2(
    p_id, p_note, case when p_gift_type is null then null else array[p_gift_type] end
  );
end;
$$;

revoke all on function public.create_note_entry_v2(text, text, text[]) from public, anon;
revoke all on function public.update_note_entry_v2(uuid, text, text[]) from public, anon;
grant execute on function public.create_note_entry_v2(text, text, text[]) to authenticated;
grant execute on function public.update_note_entry_v2(uuid, text, text[]) to authenticated;
