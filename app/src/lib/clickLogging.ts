import { shortLabel } from '@/domain/activityLog'
import { logActivity } from '@/lib/activityLogger'

/**
 * Records which button the user tapped. One capture-phase listener for the
 * whole document, so no component has to opt in and none can forget.
 *
 * Only the control's own name is recorded (aria-label, title, or visible
 * text) — never the value of an input, which is logged separately, in full,
 * at the moment it is actually saved. Password fields are never read.
 */
const CONTROL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="option"]'

export function installClickLogging(): () => void {
  const onClick = (event: MouseEvent) => {
    try {
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest(CONTROL)
      if (!control) return
      const label = shortLabel(
        control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent || '',
      )
      const region = control.closest('[role="dialog"]')?.getAttribute('aria-label')
      const state = control.getAttribute('aria-pressed') ?? control.getAttribute('aria-checked')
      logActivity({
        kind: 'tap',
        summary: label ? `Tapped “${label}”` : 'Tapped an unlabelled control',
        detail: {
          control: label || null,
          inside: region ?? null,
          state,
          page: window.location.pathname,
        },
      })
    } catch {
      // Logging never breaks a tap.
    }
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
