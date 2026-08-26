import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { signInWithPassword, signOut as signOutRequest, signUpWithPassword, type AuthOutcome } from '@/lib/auth'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface AuthUser {
  id: string
  email: string | null
}

interface AuthContextValue {
  /** Whether a Supabase project is even configured — rule 6's local-only escape hatch. */
  configured: boolean
  status: AuthStatus
  user: AuthUser | null
  signIn(email: string, password: string): Promise<AuthOutcome>
  signUp(email: string, password: string): Promise<AuthOutcome>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * What the app-level gate should show, derived purely from whether a backend
 * is even configured and the current auth status. Kept as a standalone pure
 * function (rather than inlined JSX conditionals) so every combination is
 * unit-testable without rendering anything — see `AuthContext.test.ts`.
 *
 * `configured: false` always resolves to `'app'`: with no Supabase project
 * wired up there is nothing to authenticate against, so the product falls
 * back to the same local-only mode it has always supported (rule 6) rather
 * than gating a working offline app behind a login screen it cannot satisfy.
 */
export function resolveGateView(configured: boolean, status: AuthStatus): 'loading' | 'authScreen' | 'app' {
  if (!configured) return 'app'
  if (status === 'signedIn') return 'app'
  if (status === 'loading') return 'loading'
  return 'authScreen'
}

function toAuthUser(user: { id: string; email?: string | null }): AuthUser {
  return { id: user.id, email: user.email ?? null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Nothing configured -> resolve immediately to "signed out", which
  // `resolveGateView` treats identically to "app" (see above) — never stuck
  // on a loading screen with no backend to ever answer it.
  const [status, setStatus] = useState<AuthStatus>(supabaseConfigured ? 'loading' : 'signedOut')
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) {
        setUser(toAuthUser(data.session.user))
        setStatus('signedIn')
      } else {
        setStatus('signedOut')
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session) {
        setUser(toAuthUser(session.user))
        setStatus('signedIn')
      } else {
        setUser(null)
        setStatus('signedOut')
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(signInWithPassword, [])
  const signUp = useCallback(signUpWithPassword, [])
  const signOut = useCallback(signOutRequest, [])

  const value = useMemo<AuthContextValue>(
    () => ({ configured: supabaseConfigured, status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an <AuthProvider>')
  return value
}
