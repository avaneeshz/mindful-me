import { describe, expect, it } from 'vitest'
import { resolveGateView, type AuthStatus } from './AuthContext'

describe('resolveGateView', () => {
  it('always shows the app when no Supabase project is configured (rule 6 local-only escape hatch)', () => {
    const everyStatus: AuthStatus[] = ['loading', 'signedOut', 'signedIn']
    for (const status of everyStatus) {
      expect(resolveGateView(false, status)).toBe('app')
    }
  })

  it('shows a loading state while a configured backend is still resolving the session', () => {
    expect(resolveGateView(true, 'loading')).toBe('loading')
  })

  it('shows the auth screen once resolved with no session', () => {
    expect(resolveGateView(true, 'signedOut')).toBe('authScreen')
  })

  it('shows the app once a real session exists', () => {
    expect(resolveGateView(true, 'signedIn')).toBe('app')
  })
})
