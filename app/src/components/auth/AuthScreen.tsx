import { useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Mail, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/state/AuthContext'
import { validateEmail, validatePassword } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Mode = 'signIn' | 'signUp'

const inputClass =
  'h-control w-full rounded-md border bg-white px-md text-body font-semibold text-charcoal transition-colors placeholder:font-normal placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'

/**
 * Gates the app when a Supabase project is configured but no session exists
 * yet (`resolveGateView` in `state/AuthContext.tsx`). One screen, two modes —
 * "Sign in" and "Create account" — toggled in place rather than as separate
 * routes, per the confirmed decision in the task brief.
 */
export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const emailId = useId()
  const passwordId = useId()

  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
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
    if (pending) return // Rule 9: guard against a double submit.

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

  if (pendingConfirmationEmail) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-lg text-center">
          <div className="flex size-brand items-center justify-center rounded-md bg-[linear-gradient(150deg,theme(colors.terracotta),theme(colors.gold))]">
            <Mail aria-hidden="true" className="size-[18px] text-white" />
          </div>
          <div>
            <h1 className="font-display text-h1-sm font-semibold text-forest">Check your email</h1>
            <p className="mt-sm text-body text-muted">
              We sent a confirmation link to <span className="font-semibold text-charcoal">{pendingConfirmationEmail}</span>.
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
        <div className="mx-auto flex size-brand items-center justify-center rounded-md bg-[linear-gradient(150deg,theme(colors.terracotta),theme(colors.gold))]">
          <Sparkles aria-hidden="true" className="size-[18px] text-white" />
        </div>
        <h1 className="mt-md font-display text-h1-sm font-semibold text-forest">Ritual Board</h1>
        <p className="mt-xs text-caption text-muted">Small steps. Every day.</p>
      </div>

      <div role="group" aria-label="Sign in or create an account" className="mb-xl flex rounded-md border border-line bg-white p-xs">
        <ModeToggleButton label="Sign in" active={mode === 'signIn'} onSelect={() => switchMode('signIn')} />
        <ModeToggleButton label="Create account" active={mode === 'signUp'} onSelect={() => switchMode('signUp')} />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-lg">
          <div>
            <label htmlFor={emailId} className="mb-sm block text-caption font-semibold text-muted">
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
              className={cn(inputClass, emailError ? 'border-terracotta' : 'border-line hover:border-forest-light')}
              placeholder="you@example.com"
            />
            {emailError && (
              <p id={`${emailId}-error`} className="mt-xs text-caption text-terracotta">
                {emailError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={passwordId} className="mb-sm block text-caption font-semibold text-muted">
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
              className={cn(inputClass, passwordError ? 'border-terracotta' : 'border-line hover:border-forest-light')}
              placeholder={mode === 'signUp' ? 'At least 6 characters' : undefined}
            />
            {passwordError && (
              <p id={`${passwordId}-error`} className="mt-xs text-caption text-terracotta">
                {passwordError}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-md border border-terracotta/40 bg-terracotta/10 px-md py-sm text-caption font-semibold text-terracotta">
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" block disabled={pending}>
            {pending ? (mode === 'signIn' ? 'Signing in…' : 'Creating account…') : mode === 'signIn' ? 'Sign in' : 'Create account'}
          </Button>
        </div>
      </form>

      <p className="mt-xl text-center text-caption text-muted">
        {mode === 'signIn' ? (
          <>
            Don&rsquo;t have an account?{' '}
            <button type="button" onClick={() => switchMode('signUp')} className="font-semibold text-gold hover:underline">
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('signIn')} className="font-semibold text-gold hover:underline">
              Sign in
            </button>
          </>
        )}
      </p>
    </AuthShell>
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
        active ? 'bg-forest text-white' : 'text-muted hover:text-charcoal',
      )}
    >
      {label}
    </button>
  )
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-lg py-3xl">
      <div className="w-full max-w-[400px] rounded-lg border border-line bg-white p-2xl shadow-elevation-1">
        {children}
      </div>
    </div>
  )
}
