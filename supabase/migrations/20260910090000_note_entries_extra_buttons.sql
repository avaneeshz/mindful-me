-- Fix a live bug: `NOTE_BUTTONS` (app/src/domain/notes.ts) was extended with
-- three new button keys -- `scriptures`, `summons`, `worship` -- but the DB
-- was never updated to match. `note_entries`'s own CHECK constraint and
-- `create_note_entry`'s validation both still only accepted the original six
-- ('gifts', 'chits', 'opportunities', 'learnings', 'mirror', 'prayer'), so
-- storing a note under any of the three new buttons has been failing against
-- the DB on every attempt (not a flake) -- it "saves locally, will retry"
-- and then never actually syncs, since the DB rejects it every time. This
-- widens both validation surfaces to the full nine-button set.
--
-- `gift_type` stays gifts-only exactly as it always has (SCRUM-13's own
-- decision, untouched) -- the three new buttons get no type selector, per
-- `NOTE_BUTTON_TYPES` in `domain/notes.ts`, which only lists one for
-- `gifts`/`prayer`/`learnings`.

alter table public.note_entries drop constraint note_entries_button_key_check;
alter table public.note_entries add constraint note_entries_button_key_check check (
  button_key in (
    'gifts', 'chits', 'opportunities', 'learnings', 'mirror', 'prayer',
    'scriptures', 'summons', 'worship'
  )
);

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
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Friendly errors ahead of the table's own CHECK constraints (belt and
  -- braces — same pattern `set_scheduled_activity_status` already uses for
  -- `status`).
  if p_button_key not in (
    'gifts', 'chits', 'opportunities', 'learnings', 'mirror', 'prayer',
    'scriptures', 'summons', 'worship'
  ) then
    raise exception 'invalid_button_key' using errcode = '22023';
  end if;

  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;

  if p_button_key = 'gifts' then
    if p_gift_type is null or p_gift_type not in ('Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier') then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  insert into public.note_entries (user_id, button_key, note_encrypted, gift_type)
  values (
    auth.uid(),
    p_button_key,
    internal.encrypt_note_entry_text(p_note),
    case when p_button_key = 'gifts' then p_gift_type else null end
  )
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

-- `list_note_entries` is unchanged: it never validated `button_key` against
-- the enum (only filters by it), so there is nothing to widen there.
