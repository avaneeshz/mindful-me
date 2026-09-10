import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyThemeAttribute, initialThemeFromClock, type Theme } from '@/lib/theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * The monochrome light/dark theme. It is DERIVED, not chosen: whichever
 * timeline slot is selected decides it — Day row ⇒ light, Night row ⇒ dark —
 * and `components/ThemeFromSlot.tsx` (mounted inside `BoardProvider`) is what
 * calls `setTheme` as that selection changes. There is no manual toggle and
 * nothing persisted per-device any more.
 *
 * This provider's only jobs: hold the current value, expose `setTheme` for
 * `ThemeFromSlot`, and mirror it onto the `<html data-theme>` attribute that
 * `styles/index.css` keys off. The initial value is a wall-clock guess
 * (`initialThemeFromClock`) so the very first frame — before the board has
 * mounted, and on the signed-out `AuthScreen` — already matches the slot the
 * board will select on mount.
 *
 * `useState(() => ...)` runs the initializer once, client-side only; it is
 * safe under SSR (`renderToStaticMarkup`, the whole test suite) because
 * `initialThemeFromClock` touches only `Date`, never `window`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => initialThemeFromClock())

  useEffect(() => {
    applyThemeAttribute(theme)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside a <ThemeProvider>')
  return value
}
