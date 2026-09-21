/**
 * Client-side half of the Google Health OAuth flow: building the authorize
 * URL and guarding the round trip with a CSRF `state` param. The token
 * exchange itself (and the client secret it needs) lives entirely server
 * side, in the `health-sync-oauth-callback` Edge Function — nothing in this
 * file ever sees or sends a secret.
 *
 * Scope/endpoint constants mirror `supabase/functions/_shared/
 * googleHealth.ts` — see that file's own doc comment for why they're
 * duplicated rather than shared (different runtimes, no build step in
 * common) and where the facts were verified from.
 */

export const GOOGLE_OAUTH_AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const HEALTH_SCOPE_PREFIX = 'https://www.googleapis.com/auth/googlehealth.'

/** Every readonly scope category the API exposes (the approved "everything the API exposes" scope) — `nutrition` has no `.readonly`, so it's absent. */
const HEALTH_SCOPE_CATEGORIES = [
  'activity_and_fitness',
  'sleep',
  'health_metrics_and_measurements',
  'ecg',
  'irn',
  'location',
  'mindfulness',
  'logged_symptoms',
  'reproductive_health',
  'profile',
  'settings',
] as const

export const ALL_HEALTH_SCOPES: string[] = HEALTH_SCOPE_CATEGORIES.map((c) => `${HEALTH_SCOPE_PREFIX}${c}.readonly`)

/** The frontend route Google is configured to redirect back to, on every environment's own origin — fixed, never derived differently in two places. */
export const HEALTH_SYNC_CALLBACK_PATH = '/health-sync/callback'

const STATE_STORAGE_KEY = 'mindful-me:health-sync:oauth-state'

export function healthSyncRedirectUri(): string {
  return `${window.location.origin}${HEALTH_SYNC_CALLBACK_PATH}`
}

/**
 * Generates a fresh CSRF `state` value and remembers it (per rule 6's own
 * fail-closed spirit for browser storage — a `sessionStorage` write can
 * throw in a locked-down browser; the caller still gets a usable state
 * value back, it just won't be able to verify it on return, which
 * `consumeGoogleHealthOAuthState` treats as a hard failure rather than
 * silently trusting an unverifiable callback).
 */
export function beginGoogleHealthOAuthState(): string {
  const state = crypto.randomUUID()
  try {
    sessionStorage.setItem(STATE_STORAGE_KEY, state)
  } catch {
    // Fails closed — see doc comment above.
  }
  return state
}

/** Consumes (reads and clears) the remembered state, returning it only once. */
export function consumeGoogleHealthOAuthState(): string | null {
  try {
    const value = sessionStorage.getItem(STATE_STORAGE_KEY)
    sessionStorage.removeItem(STATE_STORAGE_KEY)
    return value
  } catch {
    return null
  }
}

export function buildGoogleHealthAuthorizeUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: healthSyncRedirectUri(),
    response_type: 'code',
    scope: ALL_HEALTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${GOOGLE_OAUTH_AUTHORIZE_ENDPOINT}?${params.toString()}`
}
