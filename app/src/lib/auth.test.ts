import { describe, expect, it } from 'vitest'
import { mapAuthErrorMessage, MIN_PASSWORD_LENGTH, NETWORK_ERROR_MESSAGE, validateEmail, validatePassword } from './auth'

describe('validateEmail', () => {
  it('rejects an empty or whitespace-only value', () => {
    expect(validateEmail('')).toBe('Enter your email address.')
    expect(validateEmail('   ')).toBe('Enter your email address.')
  })

  it('rejects a value with no @ or no domain', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address.')
    expect(validateEmail('missing-domain@')).toBe('Enter a valid email address.')
    expect(validateEmail('@missing-local.com')).toBe('Enter a valid email address.')
    expect(validateEmail('no-tld@example')).toBe('Enter a valid email address.')
  })

  it('rejects a value with embedded whitespace', () => {
    expect(validateEmail('has space@example.com')).toBe('Enter a valid email address.')
  })

  it('accepts a well-formed email, trimming surrounding whitespace first', () => {
    expect(validateEmail('ava@example.com')).toBeNull()
    expect(validateEmail('  ava@example.com  ')).toBeNull()
    expect(validateEmail('ava+tag@sub.example.co.in')).toBeNull()
  })
})

describe('validatePassword', () => {
  it('rejects an empty value', () => {
    expect(validatePassword('')).toBe('Enter your password.')
  })

  it(`rejects anything shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    )
  })

  it(`accepts exactly ${MIN_PASSWORD_LENGTH} characters and anything longer`, () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH + 10))).toBeNull()
  })
})

describe('mapAuthErrorMessage', () => {
  it('maps invalid-credentials failures to a friendly, non-revealing message', () => {
    expect(mapAuthErrorMessage('Invalid login credentials')).toBe(
      "That email or password isn't right. Double-check and try again.",
    )
    // Case-insensitive — Supabase's casing has drifted across SDK versions.
    expect(mapAuthErrorMessage('invalid login credentials')).toBe(
      "That email or password isn't right. Double-check and try again.",
    )
  })

  it('maps a duplicate-signup failure to a message that points at signing in instead', () => {
    expect(mapAuthErrorMessage('User already registered')).toBe(
      'An account with this email already exists. Try signing in instead.',
    )
    expect(mapAuthErrorMessage('A user with this email address has already been registered')).toBe(
      'An account with this email already exists. Try signing in instead.',
    )
  })

  it('passes a weak-password message through as-is (it already names the exact rule)', () => {
    expect(mapAuthErrorMessage('Password should be at least 6 characters.')).toBe(
      'Password should be at least 6 characters.',
    )
  })

  it('maps rate-limit failures to a message that tells the user to wait', () => {
    expect(mapAuthErrorMessage('Email rate limit exceeded')).toBe('Too many attempts. Wait a moment and try again.')
    expect(
      mapAuthErrorMessage('For security purposes, you can only request this after 34 seconds.'),
    ).toBe('Too many attempts. Wait a moment and try again.')
  })

  it('maps an unconfirmed-email failure to a message that names the fix', () => {
    expect(mapAuthErrorMessage('Email not confirmed')).toBe(
      'Check your email for a confirmation link before signing in.',
    )
  })

  it('maps a malformed-email failure', () => {
    expect(mapAuthErrorMessage('Unable to validate email address: invalid format')).toBe(
      'Enter a valid email address.',
    )
  })

  it('maps a network failure returned AS an error result (not thrown) to the friendly message', () => {
    // Regression test: confirmed live against a real blocked network that
    // supabase-js returns this as `{ error }` rather than throwing, so it
    // never reaches the `catch`/`isNetworkFailure` path in signIn/signUp —
    // mapAuthErrorMessage has to recognize it directly. Chromium's own
    // wording; Firefox/Safari phrase the underlying fetch failure differently.
    expect(mapAuthErrorMessage('Failed to fetch')).toBe(NETWORK_ERROR_MESSAGE)
    expect(mapAuthErrorMessage('TypeError: Failed to fetch')).toBe(NETWORK_ERROR_MESSAGE)
    expect(mapAuthErrorMessage('NetworkError when attempting to fetch resource.')).toBe(NETWORK_ERROR_MESSAGE)
    expect(mapAuthErrorMessage('Load failed')).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('falls back to the original message for anything unrecognized', () => {
    expect(mapAuthErrorMessage('Some brand-new GoTrue error string')).toBe('Some brand-new GoTrue error string')
  })

  it('falls back to a generic message when there is no message at all', () => {
    expect(mapAuthErrorMessage('')).toBe('Something went wrong. Please try again.')
    expect(mapAuthErrorMessage(null)).toBe('Something went wrong. Please try again.')
    expect(mapAuthErrorMessage(undefined)).toBe('Something went wrong. Please try again.')
  })
})
