import { jsonResponse } from '../_shared/cors.ts'
import { serviceRoleClient } from '../_shared/supabaseClients.ts'
import { GOOGLE_HEALTH_PROVIDER } from '../_shared/googleHealth.ts'
import { runHealthSync, type SyncMode } from '../_shared/runHealthSync.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A real sync is a few dozen steps; anything past this is a runaway chain. */
const MAX_STEP = 200

/**
 * The background sync, run while the app is closed. Never called by a browser:
 * the hourly `health-sync-hourly` cron job (and this function itself, for the
 * next step) POSTs `{ userId, step, mode }` through `enqueue_health_sync`, with
 * the `x-health-sync-token` header only the database knows. Deployed with JWT
 * verification off, so that token is the whole of its authentication.
 *
 * Each call runs one bounded slice of the sync (the same `runHealthSync` the
 * app calls, same CPU budget per call) and queues the next slice, so a full
 * sync is a chain of short calls rather than one long one.
 */
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const token = req.headers.get('x-health-sync-token') ?? ''
  const admin = serviceRoleClient()
  const { data: valid } = token ? await admin.rpc('verify_health_sync_cron_token', { p_token: token }) : { data: false }
  if (valid !== true) return jsonResponse({ error: 'unauthorized' }, 401)

  // deno-lint-ignore no-explicit-any
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // Handled below.
  }
  const userId = typeof body?.userId === 'string' && UUID.test(body.userId) ? body.userId : null
  const step = Number.isInteger(body?.step) && body.step >= 0 ? body.step : 0
  const mode: SyncMode = body?.mode === 'quick' || body?.mode === 'full' ? body.mode : 'auto'
  if (!userId) return jsonResponse({ error: 'bad_request' }, 400)
  if (step > MAX_STEP) return jsonResponse({ ok: false, reason: 'too_many_steps' }, 200)

  const clientId = Deno.env.get('GOOGLE_HEALTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_HEALTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) return jsonResponse({ error: 'not_configured' }, 500)

  const result = await runHealthSync(admin, userId, clientId, clientSecret, GOOGLE_HEALTH_PROVIDER, step, mode)

  if (result.ok && typeof result.nextStep === 'number') {
    const { error } = await admin.rpc('enqueue_health_sync', {
      p_user_id: userId,
      p_step: result.nextStep,
      p_mode: result.mode ?? 'full',
    })
    if (error) console.warn('[health-sync-cron] could not queue the next step:', error.message)
  }
  return jsonResponse(result, 200)
})
