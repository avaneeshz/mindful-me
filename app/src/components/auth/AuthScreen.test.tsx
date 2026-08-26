import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthProvider } from '@/state/AuthContext'
import { AuthScreen } from './AuthScreen'

/**
 * Structural assertions only, in the same spirit as `App.smoke.test.tsx`:
 * `renderToStaticMarkup` never runs effects, so this proves the screen's
 * INITIAL render (idle "Sign in" mode, no errors, nothing pending) has the
 * accessible structure the brief calls for. Interactive behaviour (mode
 * toggling, validation-on-submit, the real network round-trip) needs a real
 * browser — see the task report for exactly what still needs that check.
 */
function render(): string {
  return renderToStaticMarkup(
    <AuthProvider>
      <AuthScreen />
    </AuthProvider>,
  )
}

describe('AuthScreen (initial render)', () => {
  const html = render()

  it('defaults to Sign in mode, pressed in the mode toggle group', () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>Sign in</)
  })

  it('labels both fields accessibly and ties them to a real <label>', () => {
    const emailLabelMatch = html.match(/<label[^>]*for="([^"]+)"[^>]*>Email<\/label>/)
    const passwordLabelMatch = html.match(/<label[^>]*for="([^"]+)"[^>]*>Password<\/label>/)
    expect(emailLabelMatch).not.toBeNull()
    expect(passwordLabelMatch).not.toBeNull()
    expect(html).toContain(`id="${emailLabelMatch![1]}"`)
    expect(html).toContain(`id="${passwordLabelMatch![1]}"`)
  })

  it('uses a real email input and a real password input', () => {
    expect(html).toMatch(/<input[^>]*type="email"/)
    expect(html).toMatch(/<input[^>]*type="password"/)
  })

  it('submits with a real <button type="submit"> inside a <form> (keyboard Enter works natively)', () => {
    expect(html).toContain('<form')
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Sign in<\/button>/)
  })

  it('is not disabled at rest (no request in flight yet)', () => {
    // React serializes the boolean `disabled` attribute as `disabled=""` —
    // matching that exact form (rather than a bare "disabled" substring)
    // avoids a false positive against the button's own `disabled:opacity-40`
    // Tailwind variant class, which contains the word "disabled" too.
    expect(html).not.toContain('disabled=""')
  })

  it('shows no error banner at rest', () => {
    expect(html).not.toContain('role="alert"')
  })

  it('offers the toggle to create an account instead', () => {
    expect(html).toContain('Create one')
  })

  it('never renders the timeline/editor screen behind the gate', () => {
    expect(html).not.toContain('30-Minute Slotting')
  })
})
