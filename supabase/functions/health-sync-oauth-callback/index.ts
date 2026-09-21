// deno-lint-ignore-file no-explicit-any
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceRoleClient, verifyUser } from '../_shared/supabaseClients.ts'
import { ALL_HEALTH_SCOPES, GOOGLE_HEALTH_PROVIDER, GOOGLE_OAUTH_TOKEN_ENDPOINT } from '../_shared/googleHealth.ts'
import { runHealthSync } from '../_shared/runHealthSync.ts'

/**
 * POST { code, redirectUri }, Authorization: Bearer <the signed-in user's
 * own Supabase access token>.
 *
 * Exchanges the Google authorization code for an access/refresh token pair
 * SERVER-SIDE (this is the one place `GOOGLE_HEALTH_CLIENT_SECRET` is ever
 * used — it never reaches the browser), stores them encrypted, and — best
 * effort, never blocking the response on it — kicks off the first sync
 * immediately so the dashboard has something to show right after connecting
 * rather than staying empty until the next scheduled sync.
 *
 * `redirectUri` must be byte-identical to the one the frontend used to
 * build the authorize URL (Google requires an exact match) — the frontend
 * sends it rather than this function guessing at an origin, since it
 * differs across localhost / preview / prod.
 */
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  let user: { id: string }
  try {
    user = await verifyUser(req)
  } catch {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const clientId = Deno.env.get('GOOGLE_HEALTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_HEALTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'not_configured', message: 'Google OAuth credentials are not set on this project yet.' }, 500)
  }

  let payload: { code?: string; redirectUri?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400)
  }
  if (!payload.code || !payload.redirectUri) {
    return jsonResponse({ error: 'missing_code_or_redirect_uri' }, 400)
  }

  let tokenBody: any
  try {
    const res = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: payload.code,
        redirect_uri: payload.redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
    tokenBody = await res.json()
    if (!res.ok) {
      const message = tokenBody?.error_description ?? tokenBody?.error ?? `Google token exchange failed (${res.status})`
      return jsonResponse({ error: 'token_exchange_failed', message }, 502)
    }
  } catch (err) {
    return jsonResponse({ error: 'token_exchange_failed', message: err instanceof Error ? err.message : String(err) }, 502)
  }

  const grantedScopes: string[] = typeof tokenBody.scope === 'string' ? tokenBody.scope.split(' ').filter(Boolean) : ALL_HEALTH_SCOPES
  const expiresAt = new Date(Date.now() + (tokenBody.expires_in ?? 3600) * 1000).toISOString()

  const admin = serviceRoleClient()
  const { error: storeError } = await admin.rpc('upsert_external_connection', {
    p_user_id: user.id,
    p_provider: GOOGLE_HEALTH_PROVIDER,
    p_access_token: tokenBody.access_token,
    p_refresh_token: tokenBody.refresh_token ?? null,
    p_expires_at: expiresAt,
    p_scopes: grantedScopes,
    p_status: 'connected',
  })
  if (storeError) {
    return jsonResponse({ error: 'store_failed', message: storeError.message }, 500)
  }

  // Best effort — a failed first sync (a Google hiccup, a data type with no
  // data yet) must never make the connect flow itself look like it failed.
  // The scheduled/manual sync endpoint will pick it back up.
  let firstSync: { ok: boolean; pointsSynced?: number } = { ok: false }
  try {
    firstSync = await runHealthSync(admin, user.id, clientId, clientSecret)
  } catch (err) {
    console.warn('[health-sync-oauth-callback] first sync failed:', err instanceof Error ? err.message : err)
  }

  return jsonResponse(
    { ok: true, scopes: grantedScopes, firstSync },
    200,
  )
})
