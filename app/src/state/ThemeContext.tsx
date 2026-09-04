import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyThemeAttribute, DEFAULT_THEME, loadStoredTheme, storeTheme, type Theme } from '@/lib/theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * The monochrome light/dark theme, toggled by the Sun/Moon icons next to the
 * Day/Night timeline rows (`Timeline.tsx`) — not a separate settings screen.
 * Applies app-wide (sidebar, header, timeline, tiles, popups) via the CSS
 * custom properties `styles/index.css` defines under `:root`/
 * `:root[data-theme="light"]`; this provider's only job is choosing which
 * one is active and persisting that choice per-device.
 *
 * `useState(() => ...)` reads `localStorage` lazily, once, on mount — safe
 * under SSR (`renderToStaticMarkup`, this app's whole test suite) because
 * the initializer only runs client-side; `typeof window === 'undefined'`
 * guards it explicitly regardless, same as `state/localPersistence.ts`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === 'undefined' ? DEFAULT_THEME : loadStoredTheme(),
  )

  useEffect(() => {
    applyThemeAttribute(theme)
    storeTheme(theme)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside a <ThemeProvider>')
  return value
}
