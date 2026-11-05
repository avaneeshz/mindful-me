-- create_header_button now honors a client-supplied checklist item `key`.
-- Previously it always derived the key from the label while the app keyed
-- local ticks as `item_N_<id>`, so ticking an item on a freshly created
-- checklist was rejected by set_supplement_completion (invalid_item_key).
-- Backward compatible: callers that omit `key` get the old label-derived key.

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
      -- Honor a client-supplied key (same as update_header_button) so the key the
      -- app already used for local ticks is the one the server stores.
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
