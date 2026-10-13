-- Sending the same `create_scheduled_activity` twice must be harmless.
--
-- The function already treats a repeated id as an update (`on conflict (id) do
-- update`) so a retry or a second tab is safe by design — but it first asks
-- `scheduling_ceiling(...)` for free space WITHOUT excluding the row's own id.
-- On a repeat, the row saved by the first send is "in the way", the check answers
-- "0 available", and the function raises `schedule_conflict` before it ever reaches
-- the upsert. A write the server had already accepted then looked refused, and
-- stayed "failed" on the device forever.
--
-- The fix is the one argument `scheduling_ceiling` already has for this: pass the
-- row's own id (`p_id`) so it is excluded from its own overlap check. When `p_id`
-- is null (a brand-new row with no client id) nothing is excluded, exactly as before.
--
-- Safety (checked on a copy of the live definition before this was written):
--   * Same name, same argument list, same return type, same security setting ->
--     `create or replace` is a pure body swap. No table, column, constraint, index
--     or row is touched, and existing grants are kept.
--   * The error format (`schedule_conflict: N minutes requested, M available`,
--     errcode P0001) is unchanged, so the app needs no change.
--   * Real overlaps are still refused: a DIFFERENT activity overlapping this one, and
--     the same id re-sent at a new time that overlaps ANOTHER row, both still raise.
--     The `no_overlapping_activities` exclusion constraint remains the final guard.
--   * It can only turn a previously refused repeat into an accepted one; it can never
--     cause a new refusal.
create or replace function public.create_scheduled_activity(
  p_activity_id uuid,
  p_path text[],
  p_start_at timestamp with time zone,
  p_duration_minutes integer,
  p_local_date date,
  p_start_minute smallint,
  p_timezone text,
  p_flags text[] default '{}'::text[],
  p_id uuid default null::uuid,
  p_quality text[] default '{}'::text[],
  p_symptoms text[] default '{}'::text[],
  p_notes text default null::text,
  p_reflections jsonb default '[]'::jsonb,
  p_sleep_quality text[] default '{}'::text[],
  p_dreams text default null::text,
  p_field_selections jsonb default '[]'::jsonb
)
returns scheduled_activity_dto
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ceiling integer;
  v_row public.scheduled_activities;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform internal.assert_valid_quality(p_quality, p_activity_id);
  perform internal.assert_valid_symptoms(p_symptoms, p_activity_id);
  perform internal.assert_valid_flags(p_flags, p_activity_id);
  perform internal.assert_valid_sleep_quality(p_sleep_quality);

  if p_duration_minutes > 0 then
    -- `p_id` excluded: a repeat of this same create must not collide with its own saved row.
    v_ceiling := public.scheduling_ceiling(auth.uid(), p_start_at, p_id);
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
$function$;
