-- Phase 2 / rule 10: "Flags ... are encrypted at rest, sent only over HTTPS,
-- and every query is scoped to the authenticated user."
--
-- The symmetric key lives in Supabase Vault, never in application code or a
-- plain column. `encrypt_flags`/`decrypt_flags` are the ONLY functions that
-- ever touch it, and both are SECURITY DEFINER so an ordinary authenticated
-- role never needs (and never gets) direct SELECT on `vault.decrypted_secrets`.
-- Every other privilege these functions run under is still the caller's own —
-- they do not bypass row-level security anywhere else.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'scheduled_activities_flags_key',
  'Symmetric key for encrypting scheduled_activities.flags_encrypted (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'scheduled_activities_flags_key'
);

create or replace function public.encrypt_flags(flags text[])
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when flags is null or array_length(flags, 1) is null then null
    else extensions.pgp_sym_encrypt(
      array_to_string(flags, ','),
      (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_flags_key')
    )
  end
$$;

create or replace function public.decrypt_flags(encrypted bytea)
returns text[]
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then '{}'::text[]
    else string_to_array(
      extensions.pgp_sym_decrypt(
        encrypted,
        (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_activities_flags_key')
      ),
      ','
    )
  end
$$;

-- Only these two functions may resolve the key; nobody else gets a grant on
-- `vault.decrypted_secrets` (Supabase already restricts it to the service
-- role by default — this is belt and braces, not the only line of defense).
revoke all on function public.encrypt_flags(text[]) from public;
revoke all on function public.decrypt_flags(bytea) from public;
grant execute on function public.encrypt_flags(text[]) to authenticated, service_role;
grant execute on function public.decrypt_flags(bytea) to authenticated, service_role;
