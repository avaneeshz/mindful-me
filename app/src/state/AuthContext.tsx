import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { setActivityLogUser } from '@/lib/activityLogger'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import {
  completeOAuthSignIn,
  mapOAuthCallbackError,
  signInWithPassword,
  signOut as signOutRequest,
  signUpWithPassword,
  startGoogleSignIn,
  type AuthOutcome,
} from '@/lib/auth'
import { parseAuthCallback, type AuthCallback } from '@/lib/authRedirect'

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
  /** Leaves for Google on success; see `startGoogleSignIn`. */
  signInWithGoogle(): Promise<AuthOutcome>
  /** Why the last Google round trip failed, for the auth screen to show once it's back. */
  oauthError: string | null
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
  const [oauthError, setOauthError] = useState<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  // Read once on mount: a returning "Continue with Google" redirect. The
  // exchange promise is kept here so StrictMode's double-run effect awaits
  // the same one-time code exchange instead of spending the code twice.
  const callbackRef = useRef<{ callback: AuthCallback; exchange?: Promise<AuthOutcome> } | null>(null)
  if (callbackRef.current === null) {
    callbackRef.current = { callback: parseAuthCallback(location.pathname, location.search) }
  }

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    // Settle any sign-in callback before reading the session, so the gate
    // stays on its loader instead of flashing the auth screen mid-exchange.
    const pending = callbackRef.current!
    const { callback } = pending
    if (callback && !pending.exchange) {
      pending.exchange =
        'code' in callback
          ? completeOAuthSignIn(callback.code)
          : Promise.resolve({ ok: false, message: mapOAuthCallbackError(callback.error) })
    }
    const ready = pending.exchange
      ? pending.exchange.then((outcome) => {
          if (cancelled) return
          if (!outcome.ok) setOauthError(outcome.message)
          navigate('/', { replace: true })
        })
      : Promise.resolve()

    ready.then(() => supabase!.auth.getSession()).then(({ data }) => {
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
    // Mount-only by design: the callback is read once (see callbackRef).
  }, [])

  // The activity log is per-user and records nothing while signed out (so the
  // sign-in form is never captured). Local-only mode has no accounts: one
  // device-local log.
  useEffect(() => {
    setActivityLogUser(user ? user.id : supabaseConfigured ? null : 'local')
  }, [user])

  const signIn = useCallback(signInWithPassword, [])
  const signUp = useCallback(signUpWithPassword, [])
  const signInWithGoogle = useCallback(startGoogleSignIn, [])
  const signOut = useCallback(signOutRequest, [])

  const value = useMemo<AuthContextValue>(
    () => ({ configured: supabaseConfigured, status, user, signIn, signUp, signInWithGoogle, oauthError, signOut }),
    [status, user, signIn, signUp, signInWithGoogle, oauthError, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an <AuthProvider>')
  return value
}
