import { supabaseConfigured } from '@/lib/supabaseClient'
import { useOptionalAuth } from '@/state/AuthContext'

/**
 * Whose data is on screen: the signed-in user's id, `'local'` when no backend
 * is configured (rule 6), or `null` before sign-in. Device caches key on this
 * so one account never sees another's cached content.
 */
export function useAccountOwner(): string | null {
  const auth = useOptionalAuth()
  if (!supabaseConfigured) return 'local'
  return auth?.user?.id ?? null
}
