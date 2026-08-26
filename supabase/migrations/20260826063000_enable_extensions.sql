-- Phase 2: extensions required by the scheduling schema.
--
-- pgcrypto      : symmetric encryption for the sensitive `flags` field
--                 (rule 10 — Trauma/Stress/Fear response markers).
-- supabase_vault: holds the symmetric key pgcrypto encrypts/decrypts with,
--                 so the key itself never appears in application code or a
--                 plain table column.
-- btree_gist    : lets the `no_overlapping_activities` GiST exclusion
--                 constraint combine an equality column (user_id) with a
--                 range overlap check (rule 1, enforced at the DB layer).
-- pg_cron       : schedules the 30-day soft-delete purge job (rule 11).
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists btree_gist with schema extensions;
-- pg_cron manages its own `cron` schema and is conventionally enabled
-- without a schema override.
create extension if not exists pg_cron;
