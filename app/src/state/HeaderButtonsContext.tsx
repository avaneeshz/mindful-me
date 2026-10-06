import { createContext, useContext, type ReactNode } from 'react'
import { useHeaderButtons, type UseHeaderButtonsResult } from './useHeaderButtons'

const HeaderButtonsContext = createContext<UseHeaderButtonsResult | null>(null)

/**
 * One shared `useHeaderButtons` instance for the Classic shell — the same
 * reasoning as `PickerDataContext`: the app-wide `HeaderBar` and Settings'
 * "Hidden items" section are mounted at the same time on `/settings`, and
 * two separate hook instances would each hold their own copy of the list, so
 * restoring a button in Settings wouldn't reach the header until a reload.
 */
export function HeaderButtonsProvider({ children }: { children: ReactNode }) {
  const value = useHeaderButtons()
  return <HeaderButtonsContext.Provider value={value}>{children}</HeaderButtonsContext.Provider>
}

export function useSharedHeaderButtons(): UseHeaderButtonsResult {
  const value = useContext(HeaderButtonsContext)
  if (!value) throw new Error('useSharedHeaderButtons must be used inside a <HeaderButtonsProvider>')
  return value
}
