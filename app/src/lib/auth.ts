import { supabase } from './supabaseClient'

/**
 * Result of a sign-in/sign-up attempt. Deliberately not just `boolean` —
 * the caller (AuthScreen) needs to distinguish three outcomes: succeeded
 * (a session now exists, `onAuthStateChange` will flip the app over),
 * succeeded-but-needs-confirmation (see `pendingConfirmation` below), or
 * failed with a message to show the user.
 */
export type AuthOutcome =
  | { ok: true; pendingConfirmation?: false }
  | { ok: true; pendingConfirmation: true }
  | { ok: false; message: string }

export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again."

const NOT_CONFIGURED_MESSAGE = 'Sign-in is not available right now. Please try again later.'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Supabase's default minimum for `auth.users.password` (project-configurable). */
export const MIN_PASSWORD_LENGTH = 6

/** Returns a user-facing error, or `null` when the email is acceptable to submit. */
export function validateEmail(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address.'
  return null
}

/** Returns a user-facing error, or `null` when the password is acceptable to submit. */
export function validatePassword(password: string): string | null {
  if (!password) return 'Enter your password.'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

/**
 * Translates a raw Supabase Auth error message into copy this product can
 * show a user. Pattern-matched on substrings rather than error codes because
 * `supabase-js` does not expose a stable enum for every case here — this is
 * deliberately permissive (falls back to the original message, which
 * GoTrue's own copy is usually already reasonable for) rather than risking a
 * real failure mode falling through to a useless generic string.
 */
export function mapAuthErrorMessage(rawMessage: string | null | undefined): string {
  const normalized = (rawMessage ?? '').trim()
  const lower = normalized.toLowerCase()

  if (!normalized) return 'Something went wrong. Please try again.'

  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return "That email or password isn't right. Double-check and try again."
  }
  const looksLikeDuplicateSignup =
    lower.includes('user already') ||
    lower.includes('already exists') ||
    (lower.includes('already') && lower.includes('registered'))
  if (looksLikeDuplicateSignup) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (lower.includes('password') && (lower.includes('should be at least') || lower.includes('too weak') || lower.includes('should contain'))) {
    // Supabase's own message already names the exact rule that failed
    // (length, character classes, breach list, ...) — pass it through.
    return normalized
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('for security purposes')) {
    return 'Too many attempts. Wait a moment and try again.'
  }
  const looksLikeInvalidEmail =
    lower.includes('unable to validate email') ||
    lower.includes('invalid email') ||
    (lower.includes('email address') && lower.includes('invalid'))
  if (looksLikeInvalidEmail) {
    return 'Enter a valid email address.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Check your email for a confirmation link before signing in.'
  }

  return normalized
}

/** True for the kind of failure `fetch` throws for — offline, DNS, CORS, timeouts. */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE }
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) return { ok: false, message: mapAuthErrorMessage(error.message) }
    // No email verification (confirmed decision, see BACKLOG.md): the primary
    // path is a session coming back immediately. A user-without-session only
    // happens if "Confirm email" is somehow re-enabled — show a clear "check
    // your email" state rather than silently hanging in that case.
    if (data.session) return { ok: true }
    if (data.user) return { ok: true, pendingConfirmation: true }
    return { ok: false, message: 'Something went wrong creating your account. Please try again.' }
  } catch (error) {
    return { ok: false, message: isNetworkFailure(error) ? NETWORK_ERROR_MESSAGE : mapAuthErrorMessage(String(error)) }
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { ok: false, message: mapAuthErrorMessage(error.message) }
    if (data.session) return { ok: true }
    return { ok: false, message: 'Something went wrong signing you in. Please try again.' }
  } catch (error) {
    return { ok: false, message: isNetworkFailure(error) ? NETWORK_ERROR_MESSAGE : mapAuthErrorMessage(String(error)) }
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
