import { describe, expect, it } from 'vitest'
import { AUTH_CALLBACK_PATH, parseAuthCallback } from './authRedirect'
import { mapOAuthCallbackError } from './auth'

describe('parseAuthCallback', () => {
  it('ignores every other route, including the Google Health callback', () => {
    expect(parseAuthCallback('/', '?code=abc')).toBeNull()
    expect(parseAuthCallback('/health-sync/callback', '?code=abc&state=x')).toBeNull()
  })

  it('reads the code on the sign-in callback', () => {
    expect(parseAuthCallback(AUTH_CALLBACK_PATH, '?code=abc')).toEqual({ code: 'abc' })
  })

  it('prefers an error over a code, and treats a bare callback as an error', () => {
    expect(parseAuthCallback(AUTH_CALLBACK_PATH, '?error=access_denied&code=abc')).toEqual({ error: 'access_denied' })
    expect(parseAuthCallback(AUTH_CALLBACK_PATH, '')).toEqual({ error: 'missing_code' })
  })
})

describe('mapOAuthCallbackError', () => {
  it('distinguishes a cancelled consent screen from any other failure', () => {
    expect(mapOAuthCallbackError('access_denied')).toBe('Google sign-in was cancelled.')
    expect(mapOAuthCallbackError('server_error')).toBe("Couldn't sign in with Google. Please try again.")
  })
})
