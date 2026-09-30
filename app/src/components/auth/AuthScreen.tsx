import { useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Mail, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/state/AuthContext'
import { validateEmail, validatePassword } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Mode = 'signIn' | 'signUp'

const inputClass =
  'h-control w-full rounded-md border bg-surface px-md text-body font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * Gates the app when a Supabase project is configured but no session exists
 * yet (`resolveGateView` in `state/AuthContext.tsx`). One screen, two modes —
 * "Sign in" and "Create account" — toggled in place rather than as separate
 * routes, per the confirmed decision in the task brief.
 */
export function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, oauthError } = useAuth()
  const emailId = useId()
  const passwordId = useId()

  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  // Seeded with a failed Google round trip, so coming back from one explains itself.
  const [formError, setFormError] = useState<string | null>(oauthError)
  const [pending, setPending] = useState(false)
  const [googlePending, setGooglePending] = useState(false)
  const busy = pending || googlePending
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setPassword('')
    setEmailError(null)
    setPasswordError(null)
    setFormError(null)
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
    if (emailError) setEmailError(null)
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value)
    if (passwordError) setPasswordError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return // Rule 9: guard against a double submit.

    const nextEmailError = validateEmail(email)
    const nextPasswordError = validatePassword(password)
    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    if (nextEmailError || nextPasswordError) return

    setFormError(null)
    setPending(true)
    const outcome = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password)
    setPending(false)

    if (!outcome.ok) {
      setFormError(outcome.message)
      return
    }
    if (outcome.pendingConfirmation) {
      setPendingConfirmationEmail(email)
      return
    }
    // A session now exists — AuthProvider's onAuthStateChange listener picks
    // it up and the app-level gate swaps this screen out on its own.
  }

  async function handleGoogle() {
    if (busy) return
    setFormError(null)
    setGooglePending(true)
    const outcome = await signInWithGoogle()
    // On success the browser is already leaving for Google — stay pending.
    if (!outcome.ok) {
      setGooglePending(false)
      setFormError(outcome.message)
    }
  }

  if (pendingConfirmationEmail) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-lg text-center">
          <div className="flex size-brand items-center justify-center rounded-md bg-inv-bg">
            <Mail aria-hidden="true" className="size-[18px] text-inv-ink" />
          </div>
          <div>
            <h1 className="font-display text-h1-sm font-semibold text-ink">Check your email</h1>
            <p className="mt-sm text-body text-ink-dim">
              We sent a confirmation link to <span className="font-semibold text-ink">{pendingConfirmationEmail}</span>.
              Confirm your address, then come back and sign in.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPendingConfirmationEmail(null)
              switchMode('signIn')
            }}
          >
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="mb-xl text-center">
        <div className="mx-auto flex size-brand items-center justify-center rounded-md bg-inv-bg">
          <Sparkles aria-hidden="true" className="size-[18px] text-inv-ink" />
        </div>
        <h1 className="mt-md font-display text-h1-sm font-semibold text-ink">Ritual Board</h1>
        <p className="mt-xs text-caption text-ink-dim">Small steps. Every day.</p>
      </div>

      <div role="group" aria-label="Sign in or create an account" className="mb-xl flex rounded-md border border-line bg-surface p-xs">
        <ModeToggleButton label="Sign in" active={mode === 'signIn'} onSelect={() => switchMode('signIn')} />
        <ModeToggleButton label="Create account" active={mode === 'signUp'} onSelect={() => switchMode('signUp')} />
      </div>

      <Button type="button" variant="outline" block onClick={handleGoogle} disabled={busy}>
        <GoogleMark />
        {googlePending ? 'Opening Google…' : 'Continue with Google'}
      </Button>

      <div className="my-xl flex items-center gap-md" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-caption text-ink-dim">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-lg">
          <div>
            <label htmlFor={emailId} className="mb-sm block text-caption font-semibold text-ink-dim">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={handleEmailChange}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? `${emailId}-error` : undefined}
              className={cn(inputClass, emailError ? 'border-ink' : 'border-line hover:border-ink')}
              placeholder="you@example.com"
            />
            {emailError && (
              <p id={`${emailId}-error`} className="mt-xs text-caption font-semibold text-ink">
                {emailError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={passwordId} className="mb-sm block text-caption font-semibold text-ink-dim">
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={handlePasswordChange}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? `${passwordId}-error` : undefined}
              className={cn(inputClass, passwordError ? 'border-ink' : 'border-line hover:border-ink')}
              placeholder={mode === 'signUp' ? 'At least 6 characters' : undefined}
            />
            {passwordError && (
              <p id={`${passwordId}-error`} className="mt-xs text-caption font-semibold text-ink">
                {passwordError}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-md border border-ink bg-ink/10 px-md py-sm text-caption font-semibold text-ink">
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" block disabled={busy}>
            {pending ? (mode === 'signIn' ? 'Signing in…' : 'Creating account…') : mode === 'signIn' ? 'Sign in' : 'Create account'}
          </Button>
        </div>
      </form>

      <p className="mt-xl text-center text-caption text-ink-dim">
        {mode === 'signIn' ? (
          <>
            Don&rsquo;t have an account?{' '}
            <button type="button" onClick={() => switchMode('signUp')} className="font-semibold text-ink hover:underline">
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('signIn')} className="font-semibold text-ink hover:underline">
              Sign in
            </button>
          </>
        )}
      </p>
    </AuthShell>
  )
}

/** Google's own "G" — its sign-in branding rules require the mark itself, and Lucide has no brand icons. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

function ModeToggleButton({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'flex-1 rounded-sm px-md py-sm text-body font-semibold transition-colors',
        active ? 'bg-inv-bg text-inv-ink' : 'text-ink-dim hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-lg py-3xl">
      <div className="w-full max-w-[400px] rounded-lg border border-line bg-surface p-2xl shadow-elevation-1">
        {children}
      </div>
    </div>
  )
}
