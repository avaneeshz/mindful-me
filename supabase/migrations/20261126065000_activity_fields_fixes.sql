-- Fixes found while preparing the production release of per-activity fields
-- (20261126060000_activity_fields.sql). Must run before 20261126070000.
--
-- 1. Creating an activity as a signed-in user failed with "permission denied for
--    function seed_activity_fields": the trigger that seeds a new activity's
--    standard fields ran as the signed-in user, who (rightly) cannot execute the
--    internal seeding function. Both functions now run as their owner
--    (SECURITY DEFINER, fixed search_path); execute stays revoked from clients.
-- 2. Older logged entries can point at the shared catalog copy of an activity
--    (no owner) rather than the user's own copy — the app finds the user's copy
--    by NAME. `internal.entry_root_activity` does the same, so the call that
--    saves an entry's field values (and the backfill below) work for them too.
-- 3. Backfill: the original backfill only reached entries pointing at the user's
--    own copy. This copies the values of the remaining (catalog-pointing)
--    entries. An entry whose activity the user no longer has a copy of is left
--    alone: its legacy columns still hold everything and it keeps reading
--    through the original layout.

alter function internal.seed_activity_fields(uuid) security definer;
alter function internal.seed_activity_fields_trigger() security definer;

-- The top-level activity whose fields apply to an entry on `p_activity`, for user `p_user`.
create function internal.entry_root_activity(p_user uuid, p_activity uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive up(id, parent_id, created_by, name) as (
    select a.id, a.parent_id, a.created_by, a.name from public.activities a where a.id = p_activity
    union all
    select p.id, p.parent_id, p.created_by, p.name from public.activities p join up on p.id = up.parent_id
  )
  select case
    when r.created_by is not null then r.id
    else (
      select m.id from public.activities m
      where m.created_by = p_user and m.parent_id is null and m.name = r.name
      order by m.created_at limit 1
    )
  end
  from up r where r.parent_id is null
$$;

revoke all on function internal.entry_root_activity(uuid, uuid) from public, anon;
grant execute on function internal.entry_root_activity(uuid, uuid) to authenticated;

insert into public.scheduled_activity_field_values (scheduled_activity_id, field_id, text_encrypted, labels_encrypted)
select s.id, f.id,
  case when f.kind = 'text' then s.text_enc end,
  case when f.kind = 'multiselect' then s.labels_enc end
from (
  select sa.id, k.legacy_key,
    case k.legacy_key
      when 'note_primary' then sa.notes_encrypted
      when 'note_secondary' then internal.encrypt_notes(internal.decrypt_dreams(sa.dreams_encrypted))
    end as text_enc,
    case k.legacy_key
      when 'quality' then internal.encrypt_field_selections(internal.decrypt_quality(sa.quality_encrypted))
      when 'symptom' then internal.encrypt_field_selections(internal.decrypt_symptoms(sa.symptoms_encrypted))
      when 'flag' then internal.encrypt_field_selections(internal.decrypt_flags(sa.flags_encrypted))
    end as labels_enc,
    internal.entry_root_activity(sa.user_id, sa.activity_id) as root_id
  from public.scheduled_activities sa
  join public.activities ea on ea.id = sa.activity_id and ea.created_by is null
  cross join (values ('note_primary'), ('note_secondary'), ('quality'), ('symptom'), ('flag')) as k(legacy_key)
) s
join public.activity_fields f on f.activity_id = s.root_id and f.legacy_key = s.legacy_key
where s.text_enc is not null or s.labels_enc is not null
on conflict (scheduled_activity_id, field_id) do nothing;
