-- One source of truth for an activity's note titles: `activities.note_label` /
-- `second_note_label` (added in 20261003060000). An activity-category header
-- button is now only a view of its activity's titles, so the titles a button
-- already configured (Sleep's "Note" + "Dreams", etc.) are copied onto the
-- activity it quick-logs. Without this, those activities would show a
-- different set of notes on the tile route than the header button used to.
--
-- Data-only and idempotent: it only fills titles that are still NULL, never
-- overwrites one a user already set in the activity editor, and touches only
-- the two new columns. Re-running it changes nothing.
--
-- A header button's `activity_id` points at the shared catalog activity (the
-- one with no owner); each person logs against THEIR OWN copy of it, which is
-- the top-level activity of the same name they own. That owned copy is what
-- gets the titles.
update public.activities a
set
  note_label = coalesce(a.note_label, left(p.label, 60)),
  second_note_label = coalesce(a.second_note_label, left(s.label, 60))
from public.header_buttons hb
join public.activities catalog on catalog.id = hb.activity_id
left join public.header_button_note_fields p
  on p.header_button_id = hb.id and p.field_kind = 'text' and p.field_key = 'primary'
left join public.header_button_note_fields s
  on s.header_button_id = hb.id and s.field_kind = 'text' and s.field_key = 'secondary'
where hb.category = 'activity'
  and hb.created_by is not null
  and a.created_by = hb.created_by
  and a.parent_id is null
  and a.name = catalog.name
  and (p.id is not null or s.id is not null)
  and (
    (a.note_label is null and p.id is not null)
    or (a.second_note_label is null and s.id is not null)
  );
