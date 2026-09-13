-- New header quick-log buttons: Exercise and Breathing (see the
-- full-stack-engineer agent definition's Phase 2 scope, generalizing the
-- Vipassana/Sun Exposure/Moon Exposure precedent from
-- 20260910100000_activities_entry_mode.sql). Both reuse an EXISTING catalog
-- identity rather than minting a parallel one, per the confirmed product
-- requirement: Exercise maps to the existing 'Sports or Exercise' card
-- (its sub list — Dance/Skipping/Running/HIIT/Suryanamaskar/Moonnamaskar/
-- Swimming/Badminton — is reused verbatim as the quick-log popover's
-- single-select "type" field, never duplicated), Breathing maps to the
-- existing 'Breathwork' card (no sub list, so no type field).
--
-- Both cards stay fully reachable through the ORIGINAL tile-row picker too —
-- flipping `entry_mode` does not remove or gate anything client-side (the
-- column is descriptive metadata only; see the comment on `entry_mode`'s
-- introducing migration and `api/catalog.ts`, which never reads it). This
-- mirrors Vipassana exactly: it has carried `entry_mode = 'quick_log'` since
-- Phase 2 while remaining a full tile-picker card the whole time.
update public.activities
set entry_mode = 'quick_log'
where name in ('Sports or Exercise', 'Breathwork') and parent_id is null;
