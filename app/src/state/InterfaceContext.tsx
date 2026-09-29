import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  DEFAULT_INTERFACE_MODE,
  loadInterfaceMode,
  saveInterfaceMode,
  type InterfaceMode,
} from '@/lib/interfaceMode'

interface InterfaceContextValue {
  mode: InterfaceMode
  setMode: (mode: InterfaceMode) => void
}

const InterfaceContext = createContext<InterfaceContextValue | null>(null)

/**
 * The Classic / Lumen switch. A per-device UI preference, not board data —
 * kept out of `BoardContext` for the same reason `ThemeContext` is.
 *
 * `initialMode` pins the value for tests; the app reads local storage. The
 * initializer only touches `window` when it exists, so the SSR-string test
 * suite (`renderToStaticMarkup`) renders Classic exactly as before.
 */
export function InterfaceProvider({ children, initialMode }: { children: ReactNode; initialMode?: InterfaceMode }) {
  const [mode, setModeState] = useState<InterfaceMode>(() => {
    if (initialMode) return initialMode
    return typeof window === 'undefined' ? DEFAULT_INTERFACE_MODE : loadInterfaceMode()
  })

  function setMode(next: InterfaceMode) {
    setModeState(next)
    saveInterfaceMode(next)
    window.scrollTo({ top: 0 })
  }

  return <InterfaceContext.Provider value={{ mode, setMode }}>{children}</InterfaceContext.Provider>
}

export function useInterfaceMode(): InterfaceContextValue {
  const value = useContext(InterfaceContext)
  if (!value) throw new Error('useInterfaceMode must be used inside an <InterfaceProvider>')
  return value
}
