-- Per-activity note fields. Every logged activity has one free-text note
-- (`scheduled_activities.notes_encrypted`) and room for a second
-- (`dreams_encrypted`). Until now only an activity-category header button
-- could title them (`header_button_note_fields`); this lets any activity
-- name its own notes while it is being edited, next to its quality / symptom /
-- protective-response options.
--
--   note_label        — title of the first note. NULL = the default "Add notes".
--   second_note_label — title of the second note. NULL = this activity has
--                       no second note.
--
-- Purely ADDITIVE (two nullable columns on a live table, one new RPC); the
-- two physical note columns already exist, so nothing is migrated and old
-- code that ignores these columns keeps working. The labels are only titles
-- — the note TEXT stays in the existing encrypted columns (rule 10).
-- `list_activities()` returns `setof public.activities`, so the columns
-- reach the client without redefining it.
alter table public.activities
  add column note_label text check (note_label is null or (btrim(note_label) <> '' and char_length(note_label) <= 60)),
  add column second_note_label text check (second_note_label is null or (btrim(second_note_label) <> '' and char_length(second_note_label) <= 60));

create or replace function public.set_activity_note_labels(p_id uuid, p_note_label text, p_second_note_label text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_first text := nullif(btrim(coalesce(p_note_label, '')), '');
  v_second text := nullif(btrim(coalesce(p_second_note_label, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if char_length(coalesce(v_first, '')) > 60 or char_length(coalesce(v_second, '')) > 60 then
    raise exception 'note_label_too_long' using errcode = '22023';
  end if;

  update public.activities
  set note_label = v_first, second_note_label = v_second
  where id = p_id and created_by = auth.uid();

  if not found then
    raise exception 'activity_not_found_or_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_activity_note_labels(uuid, text, text) from public, anon;
grant execute on function public.set_activity_note_labels(uuid, text, text) to authenticated;
