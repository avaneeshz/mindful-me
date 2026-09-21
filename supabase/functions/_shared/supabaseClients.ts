import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Two clients, two very different trust levels — never mixed up:
 *
 * - `verifyUser` uses the ANON key (same one the frontend uses) to validate
 *   the caller's own access token and recover their user id. It proves
 *   *who is calling*, nothing more — it cannot bypass RLS.
 * - `serviceRoleClient` uses the SERVICE_ROLE key (Supabase injects
 *   `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` into
 *   every Edge Function automatically — nothing to configure). It is the
 *   only thing in this whole feature that can call the service-role-only
 *   RPCs in the health_sync migration (upsert_external_connection,
 *   get_external_connection_for_sync, upsert_health_metrics,
 *   mark_external_connection_synced) — every one of those has EXECUTE
 *   revoked from `authenticated`, so this key is the only way in.
 */

export function serviceRoleClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not available to this function')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Verifies the bearer token on `req` (the signed-in user's own Supabase
 * access token, exactly what `supabase.auth.getSession()` gives the
 * frontend) and returns that user's id. Throws with a 401-ish message on
 * anything else — no token, expired token, garbage token.
 */
export async function verifyUser(req: Request): Promise<{ id: string }> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new Error('missing_authorization')
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not available to this function')
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) {
    throw new Error('invalid_session')
  }
  return { id: data.user.id }
}
