/**
 * Browser adapter for the "Continue with Google" sign-in round trip
 * (CLAUDE.md platform rule 2): the only place the sign-in flow touches
 * `window.location`. A native app would swap `authCallbackUrl` for a deep
 * link and keep everything else.
 *
 * Deliberately a different path from the Google Health callback
 * (`HEALTH_SYNC_CALLBACK_PATH`): both come back with a `?code=`, and only
 * this one is a Supabase Auth code. That's also why the Supabase client
 * keeps `detectSessionInUrl: false` and the exchange is done explicitly.
 */
export const AUTH_CALLBACK_PATH = '/auth/callback'

/** Where Supabase sends the browser back to after Google. Must be in Supabase's Redirect URLs allow list. */
export function authCallbackUrl(): string {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`
}

export type AuthCallback = { code: string } | { error: string } | null

/** Reads a returning sign-in redirect from the current route, or `null` when this isn't one. Pure. */
export function parseAuthCallback(pathname: string, search: string): AuthCallback {
  if (pathname !== AUTH_CALLBACK_PATH) return null
  const params = new URLSearchParams(search)
  const error = params.get('error')
  if (error) return { error }
  const code = params.get('code')
  if (code) return { code }
  return { error: 'missing_code' }
}
