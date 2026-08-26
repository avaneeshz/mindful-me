import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Local-first (rule 6): the app must work fully offline / with no backend
 * configured at all — this module is the one place that fact is allowed to
 * matter. Every caller checks `supabase` for null rather than assuming it
 * exists, so a missing `.env` (or a network the sandbox/CI can't reach)
 * degrades to local-only storage instead of crashing the app.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null

if (!supabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set — ' +
      'running local-only, nothing will sync. Copy app/.env.example to app/.env to enable sync.',
  )
}

let signInAttempted = false

/**
 * Ensures a signed-in Supabase session exists before any RPC is attempted.
 *
 * The product has no login screen (out of scope for the migration phases
 * given to build this) — this app is single-user, personal, local-first
 * software, so an anonymous Supabase auth session (a real `auth.uid()`,
 * just not tied to an email/password) is what every RLS policy and the
 * `no_overlapping_activities` constraint key off of. Attempted once per
 * page load; a failure (e.g. Anonymous Sign-ins not enabled for this
 * project yet) is caught and logged, never thrown — sync simply stays off
 * and the app keeps working from local storage alone.
 */
export async function ensureSignedIn(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  if (data.session) return true
  if (signInAttempted) return false
  signInAttempted = true
  const { error } = await supabase.auth.signInAnonymously()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[supabase] Anonymous sign-in failed — staying local-only this session.',
      '(Enable Authentication -> Sign In / Providers -> Anonymous Sign-ins in the Supabase dashboard.)',
      error.message,
    )
    return false
  }
  return true
}
