/**
 * Shared text-input/label treatment, extracted from `HeaderButtonEditor.tsx`
 * (its own former local constants) so a second settings-style editor
 * (`components/activityLibrary/*` and friends) doesn't redefine the same
 * class strings a second time — CLAUDE.md's "never create visually
 * duplicated components" rule applied to a plain style constant, not just a
 * component.
 */
export const fieldClass =
  'w-full rounded-md border border-line bg-surface px-md py-sm text-body text-ink transition-colors placeholder:text-ink-dim hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export const labelClass = 'text-caption font-semibold text-ink-dim'
