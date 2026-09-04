/**
 * The monochrome light/dark theme (confirmed product decision) — persisted
 * per-device via `localStorage`, since there is no server-side user-
 * preference field today and none was asked for. `ThemeContext` is the only
 * caller; these are pure/imperative helpers kept out of the component so
 * they're testable without rendering anything.
 *
 * Dark is the default: a first-ever load, with nothing yet stored, opens in
 * dark — matching the reference prototype's own default (`setTheme('night')`
 * on load) and `styles/index.css`'s bare `:root` block.
 */
export type Theme = 'light' | 'dark'

export const DEFAULT_THEME: Theme = 'dark'

const STORAGE_KEY = 'mindful-me:theme'

/**
 * Fails closed (never throws): a private-browsing tab, a full quota, or
 * storage blocked by policy must degrade to the default theme rather than
 * crash the app — same contract `state/localPersistence.ts` already uses.
 */
export function loadStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'light' || raw === 'dark' ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // In-memory state is still correct; only cross-reload persistence is lost.
  }
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
