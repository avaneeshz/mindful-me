-- Header buttons stop owning notes and multiple-select fields: a quick-log
-- popup now follows its ACTIVITY's fields (20261126060000_activity_fields.sql).
-- This migration moves everything that existed only on a header button onto
-- that button's activity, so nothing is lost:
--   * a button's text note titled differently from the activity's default
--     ("Note" vs "Notes" is the same field and is left alone) donates its title;
--   * a second note ("Dreams") becomes the activity's second note — an
--     auto-created hidden "Notes 2" that holds migrated history is renamed and
--     shown, otherwise the note is created;
--   * every multiple-select field ("How was your sleep?") becomes a field on
--     the activity with the same options, merged by title if the activity
--     already has a field of that name, and its logged answers are copied
--     (`scheduled_activity_field_selections` -> `scheduled_activity_field_values`).
-- Additive: the header-button tables and their data are left exactly as they
-- are (expand step); nothing reads them any more once the app is updated, and
-- they are dropped in a later release.

-- A title not already used by another field on the activity.
create function internal.free_field_label(p_activity uuid, p_label text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from public.activity_fields f where f.activity_id = p_activity and lower(btrim(f.label)) = lower(btrim(p_label)))
      then left(btrim(p_label), 48) || ' (from button)'
    else left(btrim(p_label), 60)
  end
$$;

do $$
declare
  r record;
  v_root uuid;
  v_root_owner uuid;
  v_root_name text;
  v_field uuid;
  f public.activity_fields%rowtype;
  v_base integer;
  s record;
begin
  for r in
    select hb.created_by, hb.activity_id, nf.id as nf_id, nf.field_kind, nf.field_key, btrim(nf.label) as label
    from public.header_buttons hb
    join public.header_button_note_fields nf on nf.header_button_id = hb.id
    where hb.category = 'activity' and hb.activity_id is not null and btrim(nf.label) <> ''
    order by hb.id, nf.sort_order
  loop
    with recursive up(id, parent_id, created_by, name) as (
      select a.id, a.parent_id, a.created_by, a.name from public.activities a where a.id = r.activity_id
      union all
      select p.id, p.parent_id, p.created_by, p.name from public.activities p join up on p.id = up.parent_id
    )
    select id, created_by, name into v_root, v_root_owner, v_root_name from up where parent_id is null;
    -- A button often points at the shared catalog copy of its activity (no owner); the app finds
    -- the user's own copy by name, so do the same.
    if v_root_owner is null then
      select id, created_by into v_root, v_root_owner
      from public.activities
      where created_by = r.created_by and parent_id is null and name = v_root_name
      order by created_at limit 1;
    end if;
    if v_root is null or v_root_owner is distinct from r.created_by then continue; end if;
    -- Make sure the standard fields exist (idempotent).
    perform internal.seed_activity_fields(v_root);

    if r.field_kind = 'text' and r.field_key = 'primary' then
      -- Same field as the activity's note; only a distinctive custom title is worth keeping.
      if lower(r.label) not in ('note', 'notes')
         and not exists (select 1 from public.activity_fields x where x.activity_id = v_root and lower(btrim(x.label)) = lower(r.label)) then
        update public.activity_fields set label = r.label
        where activity_id = v_root and legacy_key = 'note_primary' and label = 'Notes';
      end if;

    elsif r.field_kind = 'text' and r.field_key = 'secondary' then
      select * into f from public.activity_fields where activity_id = v_root and legacy_key = 'note_secondary';
      if not found then
        insert into public.activity_fields (activity_id, created_by, kind, label, sort_order, legacy_key)
        values (v_root, v_root_owner, 'text', internal.free_field_label(v_root, r.label), 1, 'note_secondary');
      elsif f.hidden and f.label = 'Notes 2'
            and not exists (select 1 from public.activity_fields x where x.activity_id = v_root and x.id <> f.id and lower(btrim(x.label)) = lower(r.label)) then
        update public.activity_fields set label = r.label, hidden = false where id = f.id;
      end if;

    elsif r.field_kind = 'multiselect' then
      select id into v_field from public.activity_fields
      where activity_id = v_root and kind = 'multiselect' and lower(btrim(label)) = lower(r.label) limit 1;
      if v_field is null then
        insert into public.activity_fields (activity_id, created_by, kind, label, sort_order)
        values (
          v_root, v_root_owner, 'multiselect', internal.free_field_label(v_root, r.label),
          (select coalesce(max(sort_order), -1) + 1 from public.activity_fields where activity_id = v_root)
        )
        returning id into v_field;
      end if;

      select coalesce(max(sort_order), -1) + 1 into v_base from public.activity_field_options where field_id = v_field;
      insert into public.activity_field_options (field_id, label, sort_order)
      select v_field, btrim(o.label), v_base + (row_number() over (order by o.sort_order, o.label))::int - 1
      from public.header_button_field_options o
      where o.note_field_id = r.nf_id and btrim(o.label) <> ''
      on conflict (field_id, label) do nothing;

      -- Copy what was logged, merging with anything already stored for the entry.
      for s in select scheduled_activity_id, selected_labels_encrypted from public.scheduled_activity_field_selections where note_field_id = r.nf_id loop
        insert into public.scheduled_activity_field_values (scheduled_activity_id, field_id, labels_encrypted)
        values (s.scheduled_activity_id, v_field, s.selected_labels_encrypted)
        on conflict (scheduled_activity_id, field_id) do update
          set labels_encrypted = internal.encrypt_field_selections(array(
            select distinct l from unnest(
              internal.decrypt_field_selections(public.scheduled_activity_field_values.labels_encrypted)
              || internal.decrypt_field_selections(excluded.labels_encrypted)
            ) as l
          ));
      end loop;
    end if;
    v_field := null;
  end loop;
end;
$$;

revoke all on function internal.free_field_label(uuid, text) from public, anon, authenticated;
