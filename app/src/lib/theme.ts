/**
 * The monochrome light/dark theme (confirmed product decision). It is no
 * longer a persisted per-device PREFERENCE and has no manual toggle at all:
 * the active theme is DERIVED from the currently selected timeline slot —
 * a slot in the Day row (06:00–18:00) shows the light theme, a slot in the
 * Night row shows the dark theme (see `components/ThemeFromSlot.tsx`).
 *
 * These helpers are the pure/imperative bits kept out of the component so
 * they stay testable without rendering: the first-paint fallback and the
 * `data-theme` attribute writer. `ThemeContext` is the only caller.
 */
export type Theme = 'light' | 'dark'

/**
 * The theme to paint with before the board has mounted (and for the signed-
 * out `AuthScreen`, which has no selected slot). Keyed off the wall clock so
 * that first frame already matches the slot the board will select on mount
 * (the slot containing "now"), avoiding a light⇄dark flash. Day hours are
 * 06:00–17:59, matching `periodOfSlot` / `DAY_ROW_START_SLOT` in
 * `domain/slots.ts`.
 */
export function initialThemeFromClock(now: Date = new Date()): Theme {
  const hour = now.getHours()
  return hour >= 6 && hour < 18 ? 'light' : 'dark'
}

/**
 * `styles/index.css` keys its whole light/dark swap off `:root[data-theme]`
 * (`:root` is the `<html>` element) — dark is the bare, attribute-less
 * default, so only `light` ever needs the attribute actually set; `dark`
 * removes it rather than writing a redundant `data-theme="dark"`.
 */
export function applyThemeAttribute(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}
