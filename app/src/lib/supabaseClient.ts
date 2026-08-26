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

// Real email/password auth lives in `lib/auth.ts` (sign up / sign in / sign
// out) and `state/AuthContext.tsx` (session state + the app-level gate).
// There is no anonymous-auth bootstrap any more — every `auth.uid()` RLS
// policy and the `no_overlapping_activities` constraint key off a real,
// authenticated user's session instead.
