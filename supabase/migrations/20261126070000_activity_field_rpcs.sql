-- RPCs over the per-activity custom fields tables
-- (20261126060000_activity_fields.sql). Purely additive: new functions only,
-- nothing existing is altered.
--
-- Every function is SECURITY INVOKER, so row-level security on the tables
-- still applies on top of the explicit ownership checks here. Rules that must
-- always hold (ownership, label limits, no duplicate labels, a logged value
-- may only use its own activity's fields and options) are enforced here in
-- Postgres, not only in the client (CLAUDE.md, Platform Portability rule 4).
--
-- Every create takes a client-supplied id and is idempotent on it, like every
-- other create RPC in this schema, so the offline write queue can safely retry.
-- Hiding (never deleting) is how a field or option leaves new logs.

create function public.list_activity_fields()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'activity_id', f.activity_id,
      'kind', f.kind,
      'label', f.label,
      'sort_order', f.sort_order,
      'hidden', f.hidden,
      'legacy_key', f.legacy_key,
      'options', (
        select coalesce(jsonb_agg(
          jsonb_build_object('id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'hidden', o.hidden)
          order by o.sort_order, o.label
        ), '[]'::jsonb)
        from public.activity_field_options o
        where o.field_id = f.id
      )
    )
    order by f.activity_id, f.sort_order, f.created_at
  ), '[]'::jsonb)
  from public.activity_fields f
  where f.created_by = (select auth.uid());
$$;

create function public.create_activity_field(p_id uuid, p_activity_id uuid, p_kind text, p_label text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_label text := btrim(coalesce(p_label, ''));
  v_sort integer;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_kind not in ('text', 'multiselect') then raise exception 'invalid_field_kind' using errcode = '22023'; end if;
  if v_label = '' or char_length(v_label) > 60 then raise exception 'invalid_field_label' using errcode = '22023'; end if;
  if exists (select 1 from public.activity_fields where id = p_id and created_by = v_user) then
    return p_id;
  end if;
  if exists (
    select 1 from public.activity_fields
    where activity_id = p_activity_id and created_by = v_user and lower(btrim(label)) = lower(v_label)
  ) then
    raise exception 'duplicate_field_label' using errcode = '23505';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_sort
  from public.activity_fields where activity_id = p_activity_id and created_by = v_user;
  insert into public.activity_fields (id, activity_id, created_by, kind, label, sort_order)
  values (p_id, p_activity_id, v_user, p_kind, v_label, v_sort);
  return p_id;
end;
$$;

-- A null argument means "leave unchanged".
create function public.update_activity_field(p_id uuid, p_label text default null, p_hidden boolean default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_activity uuid;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select activity_id into v_activity from public.activity_fields where id = p_id and created_by = v_user;
  if not found then raise exception 'activity_field_not_found' using errcode = 'P0002'; end if;
  if p_label is not null then
    if v_label is null or char_length(v_label) > 60 then raise exception 'invalid_field_label' using errcode = '22023'; end if;
    if exists (
      select 1 from public.activity_fields
      where activity_id = v_activity and created_by = v_user and id <> p_id and lower(btrim(label)) = lower(v_label)
    ) then
      raise exception 'duplicate_field_label' using errcode = '23505';
    end if;
  end if;
  update public.activity_fields
  set label = coalesce(v_label, label), hidden = coalesce(p_hidden, hidden)
  where id = p_id and created_by = v_user;
end;
$$;

create function public.reorder_activity_fields(p_activity_id uuid, p_ids uuid[])
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.activity_fields f
  set sort_order = o.pos - 1
  from unnest(p_ids) with ordinality as o(id, pos)
  where f.id = o.id and f.activity_id = p_activity_id and f.created_by = (select auth.uid());
$$;

create function public.create_activity_field_option(p_id uuid, p_field_id uuid, p_label text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_label text := btrim(coalesce(p_label, ''));
  v_sort integer;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_label = '' or char_length(v_label) > 60 then raise exception 'invalid_option_label' using errcode = '22023'; end if;
  if not exists (select 1 from public.activity_fields where id = p_field_id and created_by = v_user and kind = 'multiselect') then
    raise exception 'activity_field_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.activity_field_options where id = p_id and field_id = p_field_id) then
    return p_id;
  end if;
  if exists (
    select 1 from public.activity_field_options
    where field_id = p_field_id and lower(btrim(label)) = lower(v_label)
  ) then
    raise exception 'duplicate_option_label' using errcode = '23505';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_sort from public.activity_field_options where field_id = p_field_id;
  insert into public.activity_field_options (id, field_id, label, sort_order) values (p_id, p_field_id, v_label, v_sort);
  return p_id;
end;
$$;

create function public.update_activity_field_option(p_id uuid, p_label text default null, p_hidden boolean default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_field uuid;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select o.field_id into v_field
  from public.activity_field_options o join public.activity_fields f on f.id = o.field_id
  where o.id = p_id and f.created_by = v_user;
  if not found then raise exception 'activity_field_option_not_found' using errcode = 'P0002'; end if;
  if p_label is not null then
    if v_label is null or char_length(v_label) > 60 then raise exception 'invalid_option_label' using errcode = '22023'; end if;
    if exists (
      select 1 from public.activity_field_options
      where field_id = v_field and id <> p_id and lower(btrim(label)) = lower(v_label)
    ) then
      raise exception 'duplicate_option_label' using errcode = '23505';
    end if;
  end if;
  update public.activity_field_options
  set label = coalesce(v_label, label), hidden = coalesce(p_hidden, hidden)
  where id = p_id;
end;
$$;

create function public.reorder_activity_field_options(p_field_id uuid, p_ids uuid[])
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.activity_field_options o
  set sort_order = x.pos - 1
  from unnest(p_ids) with ordinality as x(id, pos)
  where o.id = x.id and o.field_id = p_field_id
    and exists (select 1 from public.activity_fields f where f.id = p_field_id and f.created_by = (select auth.uid()));
$$;

-- ===========================================================================
-- Logged values.
-- ===========================================================================
-- Replaces ALL of one logged activity's custom-field values with
-- `p_values` = [{"field_id": uuid, "text": string|null, "labels": string[]|null}].
-- A field that is absent or empty has no row. Every field must belong to the
-- logged activity's TOP-LEVEL activity (subtypes use their parent's fields),
-- text fields take `text` only and multiselect fields `labels` only, and a
-- chosen label must be one of that field's options (hidden ones included) or
-- already stored on this entry — so re-saving an old entry whose option was
-- since renamed still works, but a made-up value never gets in.
create function public.set_scheduled_activity_field_values(p_id uuid, p_values jsonb)
returns void
language plpgsql
set search_path = public, internal, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_activity uuid;
  v_root uuid;
  v jsonb;
  v_field public.activity_fields%rowtype;
  v_text text;
  v_labels text[];
  v_previous text[];
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select activity_id into v_activity from public.scheduled_activities where id = p_id and user_id = v_user;
  if not found then raise exception 'scheduled_activity_not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(coalesce(p_values, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_field_values' using errcode = '22023';
  end if;

  with recursive up(id, parent_id) as (
    select a.id, a.parent_id from public.activities a where a.id = v_activity
    union all
    select p.id, p.parent_id from public.activities p join up on p.id = up.parent_id
  )
  select id into v_root from up where parent_id is null;

  for v in select * from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) loop
    select * into v_field from public.activity_fields
    where id = (v ->> 'field_id')::uuid and created_by = v_user and activity_id = v_root;
    if not found then raise exception 'invalid_field' using errcode = '22023'; end if;

    if v_field.kind = 'text' then
      v_text := nullif(btrim(coalesce(v ->> 'text', '')), '');
      if v_text is null then continue; end if;
      if char_length(v_text) > 20000 then raise exception 'field_text_too_long' using errcode = '22023'; end if;
      insert into public.scheduled_activity_field_values (scheduled_activity_id, field_id, text_encrypted, labels_encrypted)
      values (p_id, v_field.id, internal.encrypt_notes(v_text), null)
      on conflict (scheduled_activity_id, field_id) do update
        set text_encrypted = excluded.text_encrypted, labels_encrypted = null;
    else
      select coalesce(array_agg(distinct l), '{}') into v_labels
      from jsonb_array_elements_text(coalesce(v -> 'labels', '[]'::jsonb)) as t(l);
      if coalesce(array_length(v_labels, 1), 0) = 0 then continue; end if;
      select internal.decrypt_field_selections(labels_encrypted) into v_previous
      from public.scheduled_activity_field_values where scheduled_activity_id = p_id and field_id = v_field.id;
      if exists (
        select 1 from unnest(v_labels) as chosen(label)
        where not exists (select 1 from public.activity_field_options o where o.field_id = v_field.id and o.label = chosen.label)
          and not (chosen.label = any (coalesce(v_previous, '{}')))
      ) then
        raise exception 'invalid_option' using errcode = '22023';
      end if;
      insert into public.scheduled_activity_field_values (scheduled_activity_id, field_id, text_encrypted, labels_encrypted)
      values (p_id, v_field.id, null, internal.encrypt_field_selections(v_labels))
      on conflict (scheduled_activity_id, field_id) do update
        set labels_encrypted = excluded.labels_encrypted, text_encrypted = null;
    end if;
  end loop;

  -- Anything not sent (or sent empty) no longer has a value.
  delete from public.scheduled_activity_field_values sv
  where sv.scheduled_activity_id = p_id
    and sv.field_id not in (
      select (e ->> 'field_id')::uuid
      from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) e
      where nullif(btrim(coalesce(e ->> 'text', '')), '') is not null
         or jsonb_array_length(coalesce(e -> 'labels', '[]'::jsonb)) > 0
    );
end;
$$;

-- Values for a set of logged activities, decrypted — used when loading a day.
create function public.list_scheduled_activity_field_values(p_ids uuid[])
returns jsonb
language sql
stable
set search_path = public, internal, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'scheduled_activity_id', v.scheduled_activity_id,
    'field_id', v.field_id,
    'text', internal.decrypt_notes(v.text_encrypted),
    'labels', case when v.labels_encrypted is null then null else to_jsonb(internal.decrypt_field_selections(v.labels_encrypted)) end
  )), '[]'::jsonb)
  from public.scheduled_activity_field_values v
  join public.scheduled_activities sa on sa.id = v.scheduled_activity_id
  where sa.user_id = (select auth.uid()) and v.scheduled_activity_id = any (p_ids);
$$;

revoke all on function
  public.list_activity_fields(), public.create_activity_field(uuid, uuid, text, text),
  public.update_activity_field(uuid, text, boolean), public.reorder_activity_fields(uuid, uuid[]),
  public.create_activity_field_option(uuid, uuid, text), public.update_activity_field_option(uuid, text, boolean),
  public.reorder_activity_field_options(uuid, uuid[]), public.set_scheduled_activity_field_values(uuid, jsonb),
  public.list_scheduled_activity_field_values(uuid[])
  from public, anon;
grant execute on function
  public.list_activity_fields(), public.create_activity_field(uuid, uuid, text, text),
  public.update_activity_field(uuid, text, boolean), public.reorder_activity_fields(uuid, uuid[]),
  public.create_activity_field_option(uuid, uuid, text), public.update_activity_field_option(uuid, text, boolean),
  public.reorder_activity_field_options(uuid, uuid[]), public.set_scheduled_activity_field_values(uuid, jsonb),
  public.list_scheduled_activity_field_values(uuid[])
  to authenticated;
