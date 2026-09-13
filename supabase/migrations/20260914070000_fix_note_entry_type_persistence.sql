-- Fix a confirmed bug: the "Type" selector on the Prayer and Learnings
-- note-entry pills was never actually saved. `domain/notes.ts` defines three
-- type vocabularies -- `GIFT_TYPES` (gifts), `PRAYER_TYPES` (prayer),
-- `LEARNING_TYPES` (learnings) -- and the client already sends whichever one
-- was picked as `p_gift_type` for any of the three buttons (see
-- `api/notes.ts`'s own comment: "the client field is the generic `entryType`
-- now that Prayer/Learnings feed it too"). But both `create_note_entry` and
-- `update_note_entry` have always done
-- `case when p_button_key = 'gifts' then p_gift_type else null end`
-- (create) / `case when v_button_key = 'gifts' then p_gift_type else null end`
-- (update) -- so for `prayer`/`learnings` the chosen type was silently
-- discarded and `null` stored instead, on every create AND every edit. It
-- looked like it worked because the local-first optimistic state shows the
-- chosen type immediately in the same session -- it never survived a reload,
-- a sync, or the day-export PDF, all of which read the real (null) server
-- value.
--
-- Two things land together:
--   1. Both CHECK constraints on `gift_type` widen to accept the correct
--      value for whichever of the three typed buttons it belongs to. A
--      single `in (...)` CHECK can't cleanly express "this value is valid
--      only for this specific button_key" -- so, matching this file group's
--      own established convention (a loose table CHECK plus precise
--      function-level validation that raises a friendly error --
--      `gift_type_required` already works exactly this way for the
--      "must be set for gifts" half of this), the table CHECK widens to the
--      union of all three vocabularies and `create_note_entry`/
--      `update_note_entry` keep doing the precise per-button check.
--   2. `create_note_entry` and `update_note_entry` are fixed identically:
--      validate the picked type against the CORRECT vocabulary for the
--      button (gifts/prayer/learnings each require one of their own fixed
--      values; every other button must stay null, unchanged), and -- the
--      actual fix -- store it for prayer/learnings too instead of forcing
--      null.
--
-- No backfill: every existing Prayer/Learnings row with a "lost" type was
-- already stored as null by this exact bug -- nothing was ever correctly
-- saved and later corrupted, so there is nothing to recover for existing
-- rows. Only new/edited rows save correctly from here on.
--
-- The server column/parameter stays `gift_type`/`p_gift_type` -- not
-- renamed. It's already the established, unchanged wire contract
-- (`api/notes.ts` calls it `entryType` on the client and says so in its own
-- comment); renaming the column would touch the DTO, every RPC signature,
-- and the client mapper for a bug fix that doesn't need any of that
-- surface touched.

-- --- Step 1: widen both CHECK constraints on gift_type. --------------------

alter table public.note_entries drop constraint note_entries_gift_type_check;
alter table public.note_entries add constraint note_entries_gift_type_check check (
  gift_type is null or gift_type in (
    -- gifts (Extra Senses)
    'Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier',
    -- prayer
    'Adoration', 'Thanksgiving', 'Repentance', 'Seeking forgiveness',
    'Petition/Supplication', 'Intercession', 'Contemplation',
    -- learnings
    'Given', 'Realized', 'Revealed'
  )
);

alter table public.note_entries drop constraint gift_type_only_for_gifts;
alter table public.note_entries add constraint gift_type_only_for_gifts check (
  gift_type is null or button_key in ('gifts', 'prayer', 'learnings')
);

-- --- Step 2: create_note_entry -- validate against the correct per-button
-- vocabulary and actually store it for prayer/learnings. --------------------

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

  -- Each typed button requires one of its own fixed values; every other
  -- button gets no type selector at all (`NOTE_BUTTON_TYPES` in
  -- `domain/notes.ts`) and whatever arrives in p_gift_type for it is
  -- ignored below, unchanged from before this fix.
  if p_button_key = 'gifts' then
    if p_gift_type is null or p_gift_type not in ('Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier') then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  elsif p_button_key = 'prayer' then
    if p_gift_type is null or p_gift_type not in (
      'Adoration', 'Thanksgiving', 'Repentance', 'Seeking forgiveness',
      'Petition/Supplication', 'Intercession', 'Contemplation'
    ) then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  elsif p_button_key = 'learnings' then
    if p_gift_type is null or p_gift_type not in ('Given', 'Realized', 'Revealed') then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  insert into public.note_entries (user_id, button_key, note_encrypted, gift_type)
  values (
    auth.uid(),
    p_button_key,
    internal.encrypt_note_entry_text(p_note),
    -- The actual fix: prayer/learnings now store their picked type instead
    -- of it being forced to null.
    case when p_button_key in ('gifts', 'prayer', 'learnings') then p_gift_type else null end
  )
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

-- --- Step 3: update_note_entry -- same bug, same fix, same function shape
-- it already mirrors. --------------------------------------------------------

create or replace function public.update_note_entry(
  p_id uuid,
  p_note text,
  p_gift_type text default null
) returns public.note_entry_dto
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.note_entries;
  v_button_key text;
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

  if v_button_key = 'gifts' then
    if p_gift_type is null or p_gift_type not in ('Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier') then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  elsif v_button_key = 'prayer' then
    if p_gift_type is null or p_gift_type not in (
      'Adoration', 'Thanksgiving', 'Repentance', 'Seeking forgiveness',
      'Petition/Supplication', 'Intercession', 'Contemplation'
    ) then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  elsif v_button_key = 'learnings' then
    if p_gift_type is null or p_gift_type not in ('Given', 'Realized', 'Revealed') then
      raise exception 'gift_type_required' using errcode = '22023';
    end if;
  end if;

  update public.note_entries
  set note_encrypted = internal.encrypt_note_entry_text(p_note),
      -- The actual fix: prayer/learnings now store their picked type
      -- instead of it being forced to null.
      gift_type = case when v_button_key in ('gifts', 'prayer', 'learnings') then p_gift_type else null end
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning * into v_row;

  return public.to_note_entry_dto(v_row);
end;
$$;

-- Grants: signatures are unchanged, so the existing grants from
-- 20260905090000/20260913070000 already cover these — nothing to re-grant.
