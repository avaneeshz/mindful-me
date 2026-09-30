import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceRoleClient, verifyUser } from '../_shared/supabaseClients.ts'
import { GOOGLE_HEALTH_PROVIDER } from '../_shared/googleHealth.ts'
import { runHealthSync, type SyncMode } from '../_shared/runHealthSync.ts'

/**
 * POST, Authorization: Bearer <the signed-in user's own Supabase access
 * token>, body `{ step?: number, mode?: 'full' | 'quick' | 'auto' }`. Each call does one bounded slice of the
 * sync and returns `nextStep` (or `null` when done); the caller loops.
 *
 * The manual "sync now" action, and also what a future scheduled trigger
 * would call — `runHealthSync` itself refreshes the access token first if
 * it's due to expire, so this is the one entry point that keeps a
 * connection alive over time.
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

  // `{ step }` resumes a sync where the previous call stopped (see
  // `runHealthSync`); an empty body starts one from the beginning.
  let step = 0
  let mode: SyncMode = 'full'
  try {
    const body = await req.json()
    if (Number.isInteger(body?.step) && body.step >= 0) step = body.step
    if (body?.mode === 'quick' || body?.mode === 'auto' || body?.mode === 'full') mode = body.mode
  } catch {
    // No body — start at 0.
  }

  const admin = serviceRoleClient()
  const result = await runHealthSync(admin, user.id, clientId, clientSecret, GOOGLE_HEALTH_PROVIDER, step, mode)

  if (!result.ok) {
    const status = result.reason === 'not_connected' ? 404 : result.reason === 'reauth_required' ? 409 : 500
    return jsonResponse(result, status)
  }
  return jsonResponse(result, 200)
})
