-- Follow-up to this same feedback round's client-side fix
-- (`state/parameterOptionsProvisioning.ts`, `state/useParameterOptions.ts`):
-- that fix de-dupes concurrent `useParameterOptions(null)` instances WITHIN
-- one browser tab (module-level state, one JS heap) — it closes the
-- reported bug (a brand-new user's very first Edit-mode open mounting both
-- `SlotEditor`'s and `ActivityLibraryPanel`'s own instance at once) exactly
-- as asked. Found in a second self-review pass: it does NOT, by itself,
-- close the same race across two browser tabs or two devices open at once
-- on the same brand-new account — different JS heaps never share that
-- module-level guard, and this function itself was still a plain
-- check-then-insert (`if exists(...) return; insert ...`), not atomic, so
-- two real concurrent calls reaching Postgres closely enough together could
-- still both pass the `exists` check before either commits, with the
-- second insert tripping `activity_parameter_options_scope_idx` and
-- failing — the exact same bug, just needing two tabs/devices instead of
-- two components in one tab.
--
-- Fix: a transaction-scoped advisory lock keyed on the user's own id,
-- taken before the `exists` check. Two concurrent calls for the SAME user
-- now genuinely serialize at the database — whichever call arrives second
-- blocks until the first's transaction (a single RPC call, autocommitted)
-- finishes, then re-runs its own `exists` check and finds the first call's
-- rows already committed, returning immediately rather than attempting a
-- second, doomed insert. `pg_advisory_xact_lock` releases automatically at
-- transaction end — no matching unlock call needed, and never held across
-- separate RPC calls. `hashtext(v_user::text)` maps the uuid to the bigint
-- key `pg_advisory_xact_lock` takes; a hash collision between two different
-- users would only ever cost a moment's unnecessary serialization between
-- their two unrelated provisioning calls, never incorrect data (the
-- `exists` check inside is still scoped to `created_by = v_user`).
--
-- This is scoped to `provision_default_parameter_options` alone —
-- `provision_default_tiles`/`provision_default_activities` have the exact
-- same check-then-insert shape, but are not affected by this round's
-- change: `useTiles`/`useActivityHierarchy` are both read through one
-- shared instance per app (`state/PickerDataContext.tsx`), so two
-- concurrent same-tab callers were never possible for them the way they now
-- are for `useParameterOptions`. Left alone rather than speculatively
-- "fixed" for a race that isn't actually reachable there today.
create or replace function public.provision_default_parameter_options()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if exists (select 1 from public.activity_parameter_options where created_by = v_user) then
    return;
  end if;

  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select v_user, null, 'quality', v.label, v.ord
  from (values
    ('Resonance', 0), ('Flow', 1), ('Scattered', 2), ('Overstimulated', 3), ('Zone out', 4),
    ('Numb', 5), ('Engaged', 6), ('Bored', 7), ('Resistant', 8), ('Frozen', 9), ('Avoiding', 10),
    ('Confusion', 11), ('Compulsive persistent', 12), ('Interoceptive Override', 13), ('Addictive', 14),
    ('Nourishing', 15), ('Draining', 16), ('Energizing', 17)
  ) as v(label, ord);

  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select v_user, null, 'symptom', v.label, v.ord
  from (values
    ('Pitta', 0), ('Inflammation', 1), ('Right knee pain', 2), ('Calves pain', 3), ('Temporal pain', 4), ('Dryness', 5)
  ) as v(label, ord);

  insert into public.activity_parameter_options (created_by, activity_id, parameter_type, label, sort_order)
  select v_user, null, 'flag', v.label, v.ord
  from (values
    ('Trauma Activation', 0), ('Triggered', 1), ('Attack', 2), ('Anger', 3), ('Procrastinated', 4),
    ('Shut Down', 5), ('Collapse', 6), ('Over Accommodating', 7), ('Hyper Responsibility', 8),
    ('Over Function', 9), ('Intellectualization', 10), ('Optimization', 11), ('Hyper Vigilance', 12),
    ('Problem Solving', 13)
  ) as v(label, ord);
end;
$$;

revoke all on function public.provision_default_parameter_options() from public, anon;
grant execute on function public.provision_default_parameter_options() to authenticated;
