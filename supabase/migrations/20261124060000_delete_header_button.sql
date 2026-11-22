-- Permanent delete for a header button the user has already hidden.
--
-- Mirrors `delete_tile` / `delete_activity`: the server is the authority on
-- whether a delete is allowed. A button whose logged data still exists
-- (notes, daily values, checklist completions) is refused with
-- `header_button_has_history_use_hide` so the client keeps it hidden instead
-- of orphaning that data. Child rows (note fields, note types, checklist
-- items, per-user hide/order state) go with it through their existing
-- `on delete cascade`.
--
-- Additive only: one new function, no change to any existing shape.

create or replace function public.delete_header_button(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_button public.header_buttons;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_button from public.header_buttons where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'header_button_not_found' using errcode = 'P0002';
  end if;

  if v_button.category = 'notes' and v_button.key is not null and exists (
    select 1 from public.note_entries where user_id = auth.uid() and button_key = v_button.key
  ) then
    raise exception 'header_button_has_history_use_hide' using errcode = 'P0001';
  end if;

  if v_button.category = 'day_value' and v_button.key is not null and exists (
    select 1 from public.daily_values where user_id = auth.uid() and metric_key = v_button.key
  ) then
    raise exception 'header_button_has_history_use_hide' using errcode = 'P0001';
  end if;

  if v_button.category = 'checklist' and exists (
    select 1 from public.supplement_completions where user_id = auth.uid() and header_button_id = p_id
  ) then
    raise exception 'header_button_has_history_use_hide' using errcode = 'P0001';
  end if;

  delete from public.header_buttons where id = p_id and created_by = auth.uid();
end;
$$;

revoke all on function public.delete_header_button(uuid) from public, anon;
grant execute on function public.delete_header_button(uuid) to authenticated;
