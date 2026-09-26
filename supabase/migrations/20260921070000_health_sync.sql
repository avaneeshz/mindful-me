-- Health Sync — read-only viewer for a connected third-party health account
-- (Google Health API: Fitbit / Pixel Watch data). Entirely new, additive
-- schema: does NOT touch `activities` / `scheduled_activities` /
-- `activity_events` or the scheduling model in any way.
--
-- Two tables:
--   external_connections — one row per (user, provider). Holds the OAuth
--     tokens (encrypted) that let a background Edge Function sync on the
--     user's behalf. `provider` is a free-text column (not an enum) so a
--     second provider later doesn't need a migration to add.
--   health_metrics — synced data points. Read-only from the client's point
--     of view: there is no INSERT/UPDATE/DELETE policy for `authenticated`
--     at all, only a SELECT policy. All writes come from the sync Edge
--     Function via service_role, through the SECURITY DEFINER wrappers
--     below, never directly from a user's session.
--
-- Rule 10 — encrypted at rest: reuses the *exact* pattern from
-- 20260826063300_flags_encryption.sql / 20260826064100_move_crypto_functions
-- _to_internal_schema.sql — a Supabase Vault secret per encrypted column,
-- pgp_sym_encrypt/pgp_sym_decrypt wrapped in internal.* (never public.*, so
-- PostgREST can't expose them directly) SECURITY DEFINER functions. Two new
-- keys (not the flags key) so a compromise of one doesn't also expose the
-- other: OAuth tokens and health values are different blast radii.
--
-- Rule 8 — every read is a bounded window: `list_health_metrics` requires an
-- explicit range, exactly like `list_scheduled_activities`.

-- ---------------------------------------------------------------------
-- Vault keys + internal crypto functions
-- ---------------------------------------------------------------------

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'external_connections_token_key',
  'Symmetric key for encrypting external_connections OAuth token columns (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'external_connections_token_key'
);

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'health_metrics_value_key',
  'Symmetric key for encrypting health_metrics value/raw-response columns (rule 10).'
)
where not exists (
  select 1 from vault.secrets where name = 'health_metrics_value_key'
);

create function internal.encrypt_external_token(token text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when token is null then null
    else extensions.pgp_sym_encrypt(
      token,
      (select decrypted_secret from vault.decrypted_secrets where name = 'external_connections_token_key')
    )
  end
$$;

create function internal.decrypt_external_token(encrypted bytea)
returns text
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then null
    else extensions.pgp_sym_decrypt(
      encrypted,
      (select decrypted_secret from vault.decrypted_secrets where name = 'external_connections_token_key')
    )
  end
$$;

-- Token crypto functions are reachable by service_role only — an ordinary
-- signed-in session (role `authenticated`) never has a legitimate reason to
-- decrypt an OAuth token; only the sync Edge Function does, and it always
-- calls through it as service_role.
revoke all on function internal.encrypt_external_token(text) from public, anon, authenticated;
revoke all on function internal.decrypt_external_token(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_external_token(text) to service_role;
grant execute on function internal.decrypt_external_token(bytea) to service_role;

create function internal.encrypt_health_value(value text)
returns bytea
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when value is null then null
    else extensions.pgp_sym_encrypt(
      value,
      (select decrypted_secret from vault.decrypted_secrets where name = 'health_metrics_value_key')
    )
  end
$$;

create function internal.decrypt_health_value(encrypted bytea)
returns text
language sql
stable
security definer
set search_path = extensions, vault, pg_temp
as $$
  select case
    when encrypted is null then null
    else extensions.pgp_sym_decrypt(
      encrypted,
      (select decrypted_secret from vault.decrypted_secrets where name = 'health_metrics_value_key')
    )
  end
$$;

-- Health values ARE read back by the client (list_health_metrics runs as
-- the authenticated caller, SECURITY INVOKER, same shape as
-- to_scheduled_activity_dto) — so, unlike the token functions,
-- `authenticated` needs EXECUTE here too. service_role needs it for the
-- sync function's upsert.
revoke all on function internal.encrypt_health_value(text) from public, anon, authenticated;
revoke all on function internal.decrypt_health_value(bytea) from public, anon, authenticated;
grant execute on function internal.encrypt_health_value(text) to authenticated, service_role;
grant execute on function internal.decrypt_health_value(bytea) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- external_connections
-- ---------------------------------------------------------------------

create table public.external_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Free text, not an enum: "don't hardcode assuming only one provider
  -- ever" — 'google_health' today, room for another later with no migration.
  provider text not null check (length(provider) > 0),

  -- Rule 10 — encrypted at rest. Never a plain token column. Access token
  -- is required; refresh token can be briefly null only if Google ever
  -- fails to issue one (shouldn't happen with access_type=offline +
  -- prompt=consent, but the schema doesn't assume it).
  access_token_encrypted bytea not null,
  refresh_token_encrypted bytea,
  token_type text not null default 'Bearer',
  expires_at timestamptz not null,
  scopes text[] not null default '{}',

  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'error')),
  last_error text,
  last_synced_at timestamptz,
  -- Per-data-type sync backfill cursor (Phase-agnostic sync bookkeeping, not
  -- schedule state): `{ "<data_type>": { "frontier": "<ISO timestamp>", "backfillComplete": bool } }`.
  -- See supabase/functions/_shared/googleHealth.ts for how it's used —
  -- never read or written directly by the client.
  sync_state jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, provider)
);

create trigger external_connections_set_updated_at
  before update on public.external_connections
  for each row execute function public.set_updated_at();

alter table public.external_connections enable row level security;

-- Rule 10 — scoped to the authenticated owner. The client is never granted
-- INSERT/UPDATE/DELETE on this table directly (no policies for them at
-- all): every write is a service_role call through a SECURITY DEFINER
-- wrapper below, so the user's own session can read row *presence and
-- status* but can never write — or even read — a token, encrypted or not,
-- except via `get_health_connection_status`'s deliberately narrow DTO.
create policy "read own connections"
  on public.external_connections for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- health_metrics
-- ---------------------------------------------------------------------

create table public.health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.external_connections (id) on delete cascade,

  -- Kebab-case Google Health data type id (`steps`, `heart-rate`, `sleep`, …
  -- — see the DATA_TYPES registry in supabase/functions/_shared/
  -- googleHealth.ts). Left as plain text, not an enum: this is exactly the
  -- kind of "extendable to whatever the API exposes" surface an enum would
  -- fight, and it isn't itself sensitive (a category label, not a value).
  data_type text not null check (length(data_type) > 0),

  -- A point sample's instant, or a ranged/rollup point's start (a sleep
  -- session, a daily steps rollup). `end_at` is null for a point sample.
  recorded_at timestamptz not null,
  end_at timestamptz,
  constraint health_metrics_end_after_recorded check (end_at is null or end_at >= recorded_at),

  -- Rule 10 — encrypted at rest. This data spans sleep, heart-rate, ECG,
  -- logged symptoms and reproductive-health categories (see the agent
  -- brief's judgment call, reported back to the user): the uniform choice
  -- is to encrypt every value/raw-response payload the same way, rather
  -- than special-case "sensitive" vs. "not" data types — simpler, and rule
  -- 10 already says "every similarly sensitive field".
  value_encrypted bytea not null,
  unit text,
  -- Device/app name Google reports this point as sourced from, e.g.
  -- "Pixel Watch", "Fitbit Charge 6". Not sensitive on its own; kept plain
  -- so it's usable as a display/filter field without a decrypt round trip.
  source text,
  raw_response_encrypted bytea,

  -- The API's own identifier for this point (or a value synthesized in the
  -- sync function for rollup points, which have no natural one, e.g.
  -- `"steps:2026-09-20"`) — the upsert target, so a repeat sync never
  -- double-inserts the same point.
  external_id text not null check (length(external_id) > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (connection_id, data_type, external_id)
);

create trigger health_metrics_set_updated_at
  before update on public.health_metrics
  for each row execute function public.set_updated_at();

-- Rule 8 — every read of "today"/"this week" is scoped to that window; this
-- is the index that scoping actually uses.
create index health_metrics_user_type_recorded_idx
  on public.health_metrics (user_id, data_type, recorded_at desc);
create index health_metrics_connection_idx on public.health_metrics (connection_id);

alter table public.health_metrics enable row level security;

-- Read-only viewer, by design: a SELECT policy and nothing else. There is
-- no INSERT/UPDATE/DELETE policy for `authenticated` at all — the client
-- can never write a health metric, only the sync Edge Function (service_role,
-- via upsert_health_metrics below) can.
create policy "read own health metrics"
  on public.health_metrics for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Service-role-only RPCs — the ONLY way tokens or metrics are ever written.
-- Every one of these is SECURITY DEFINER with EXECUTE revoked from
-- anon/authenticated and granted to service_role alone, so even though
-- PostgREST exposes them at /rest/v1/rpc/..., a normal user session gets
-- permission denied — only the Edge Functions' service-role key can call
-- them. This mirrors this migration set's established pattern (narrow
-- grants as the real boundary, not merely "nobody happens to call it").
-- ---------------------------------------------------------------------

-- Called by the OAuth callback function right after exchanging a code, and
-- by the token-refresh step before a sync. `p_user_id` is NOT taken from
-- auth.uid() (there is no authenticated session in a service-role call) —
-- it is the id the Edge Function already verified from the user's own
-- access token via supabase.auth.getUser(). A null `p_refresh_token` keeps
-- whatever refresh token is already stored (Google's token endpoint often
-- omits it on a plain refresh — only the first consent is guaranteed to
-- include one).
create function public.upsert_external_connection(
  p_user_id uuid,
  p_provider text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_scopes text[],
  p_status text default 'connected'
) returns uuid
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;

  insert into public.external_connections (
    user_id, provider, access_token_encrypted, refresh_token_encrypted,
    expires_at, scopes, status, last_error
  ) values (
    p_user_id, p_provider,
    internal.encrypt_external_token(p_access_token),
    internal.encrypt_external_token(p_refresh_token),
    p_expires_at, coalesce(p_scopes, '{}'), p_status, null
  )
  on conflict (user_id, provider) do update set
    access_token_encrypted = excluded.access_token_encrypted,
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, public.external_connections.refresh_token_encrypted),
    expires_at = excluded.expires_at,
    scopes = excluded.scopes,
    status = excluded.status,
    last_error = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_external_connection(uuid, text, text, text, timestamptz, text[], text) from public, anon, authenticated;
grant execute on function public.upsert_external_connection(uuid, text, text, text, timestamptz, text[], text) to service_role;

-- Called by the sync function before every run: the only place a decrypted
-- token ever leaves the database, and only into the service-role context
-- (never returned to a client).
create function public.get_external_connection_for_sync(p_user_id uuid, p_provider text)
returns table (
  id uuid,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  status text,
  sync_state jsonb
)
language sql
stable
security definer
set search_path = public, internal, pg_temp
as $$
  select
    c.id,
    internal.decrypt_external_token(c.access_token_encrypted),
    internal.decrypt_external_token(c.refresh_token_encrypted),
    c.expires_at, c.scopes, c.status, c.sync_state
  from public.external_connections c
  where c.user_id = p_user_id and c.provider = p_provider
$$;

revoke all on function public.get_external_connection_for_sync(uuid, text) from public, anon, authenticated;
grant execute on function public.get_external_connection_for_sync(uuid, text) to service_role;

-- Bookkeeping the sync function calls after each run: records the outcome
-- and (optionally) an updated per-data-type backfill cursor. Kept separate
-- from upsert_external_connection, which is specifically the token-writing
-- path — this one never touches a token column.
create function public.mark_external_connection_synced(
  p_id uuid,
  p_status text,
  p_last_error text default null,
  p_sync_state jsonb default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.external_connections
  set
    last_synced_at = now(),
    status = p_status,
    last_error = p_last_error,
    sync_state = coalesce(p_sync_state, sync_state)
  where id = p_id
$$;

revoke all on function public.mark_external_connection_synced(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.mark_external_connection_synced(uuid, text, text, jsonb) to service_role;

-- Bulk upsert used by the sync function. `p_rows` is a jsonb array of
-- objects shaped like:
--   { "user_id", "connection_id", "data_type", "recorded_at", "end_at"?,
--     "value" (raw text, JSON-stringified if structured), "unit"?,
--     "source"?, "raw_response"? (JSON-stringified), "external_id" }
-- One statement per call (not one call per row) so a sync run doesn't
-- issue hundreds of round trips.
create function public.upsert_health_metrics(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_count integer;
begin
  with rows as (
    select
      (r->>'user_id')::uuid as user_id,
      (r->>'connection_id')::uuid as connection_id,
      r->>'data_type' as data_type,
      (r->>'recorded_at')::timestamptz as recorded_at,
      nullif(r->>'end_at', '')::timestamptz as end_at,
      internal.encrypt_health_value(r->>'value') as value_encrypted,
      r->>'unit' as unit,
      r->>'source' as source,
      case when r->>'raw_response' is null then null else internal.encrypt_health_value(r->>'raw_response') end as raw_response_encrypted,
      r->>'external_id' as external_id
    from jsonb_array_elements(p_rows) as r
  )
  insert into public.health_metrics (
    user_id, connection_id, data_type, recorded_at, end_at,
    value_encrypted, unit, source, raw_response_encrypted, external_id
  )
  select
    user_id, connection_id, data_type, recorded_at, end_at,
    value_encrypted, unit, source, raw_response_encrypted, external_id
  from rows
  on conflict (connection_id, data_type, external_id) do update set
    recorded_at = excluded.recorded_at,
    end_at = excluded.end_at,
    value_encrypted = excluded.value_encrypted,
    unit = excluded.unit,
    source = excluded.source,
    raw_response_encrypted = excluded.raw_response_encrypted;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.upsert_health_metrics(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_health_metrics(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Client-facing RPCs — SECURITY INVOKER (the default), run as the calling
-- `authenticated` user, RLS-scoped by the policies above. These are the
-- only way the client ever sees connection status or metric values.
-- ---------------------------------------------------------------------

-- Zero or one row: no row means "never connected". Deliberately excludes
-- every token column, encrypted or not — the client never receives a token
-- in any form.
create function public.get_health_connection_status(p_provider text)
returns table (
  status text,
  scopes text[],
  expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select status, scopes, expires_at, last_synced_at, last_error, created_at
  from public.external_connections
  where user_id = (select auth.uid()) and provider = p_provider
$$;

-- One row per data type that has ever synced, for the dashboard's category
-- list — a light aggregate, never the decrypted values themselves, so
-- rendering the category list needs no decrypt round trip at all.
create function public.list_health_data_type_summaries(p_provider text)
returns table (
  data_type text,
  latest_recorded_at timestamptz,
  point_count_recent bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  select m.data_type, max(m.recorded_at), count(*) filter (where m.recorded_at >= now() - interval '30 days')
  from public.health_metrics m
  join public.external_connections c on c.id = m.connection_id
  where m.user_id = (select auth.uid()) and c.provider = p_provider
  group by m.data_type
$$;

-- Rule 8 — always a bounded window, exactly like list_scheduled_activities.
-- Decrypts server-side; the client never receives ciphertext or a key.
create function public.list_health_metrics(
  p_provider text,
  p_data_type text,
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns table (
  id uuid,
  data_type text,
  recorded_at timestamptz,
  end_at timestamptz,
  value text,
  unit text,
  source text
)
language sql
stable
set search_path = public, internal, pg_temp
as $$
  select m.id, m.data_type, m.recorded_at, m.end_at,
    internal.decrypt_health_value(m.value_encrypted), m.unit, m.source
  from public.health_metrics m
  join public.external_connections c on c.id = m.connection_id
  where m.user_id = (select auth.uid())
    and c.provider = p_provider
    and m.data_type = p_data_type
    and m.recorded_at >= p_range_start
    and m.recorded_at < p_range_end
  order by m.recorded_at asc
$$;

-- Disconnect: immediate, from the client's own session, no service-role
-- round trip needed — deleting own connection row is a safe thing for
-- `authenticated` to do directly (no DELETE policy exists, so this uses the
-- same "SECURITY DEFINER + explicit auth.uid() check" shape
-- purge_deleted_scheduled_activities uses for its own hard delete, rather
-- than adding a DELETE policy). Cascades to that connection's health_metrics
-- (FK on delete cascade) — disconnecting removes the synced data with it,
-- so there is no encrypted data left over for a connection nothing points
-- at any more.
create function public.disconnect_health_connection(p_provider text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.external_connections
  where user_id = auth.uid() and provider = p_provider;
end;
$$;

revoke all on function public.disconnect_health_connection(text) from public, anon;
grant execute on function public.disconnect_health_connection(text) to authenticated;
