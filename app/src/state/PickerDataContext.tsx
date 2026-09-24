import { createContext, useContext, type ReactNode } from 'react'
import { useActivityHierarchy, type UseActivityHierarchyResult } from './useActivityHierarchy'
import { useTiles, type UseTilesResult } from './useTiles'

interface PickerDataContextValue {
  tiles: UseTilesResult
  activities: UseActivityHierarchyResult
}

const PickerDataContext = createContext<PickerDataContextValue | null>(null)

/**
 * One shared `useTiles`/`useActivityHierarchy` instance for the whole app —
 * found missing in review (PICKER-CUSTOM-1's live-picker rewiring): before
 * this, `state/useLiveActivityCatalogSync.ts` (mounted once in
 * `BoardProvider`) and `routes/ActivityLibraryPage.tsx` (mounted per-visit
 * to that route) each called `useTiles()`/`useActivityHierarchy()`
 * independently, minting two entirely separate sets of React state backed
 * by the same server rows. Editing a tile/activity in Activity Library
 * updated only ITS OWN hook instance — the live picker's separate instance
 * (and therefore `data/activities.ts`'s live catalog registry) never saw
 * the change until a full reload remounted `BoardProvider` from scratch.
 *
 * Mounted once, above `BoardProvider`, in `App.tsx` — both `BoardProvider`
 * (via `useLiveActivityCatalogSync`) and `ActivityLibraryPage` are its
 * descendants (both sit under the same `<Routes>`), so they now read and
 * mutate the exact same state: an edit in one is visible in the other on
 * the very next render, no reload needed.
 */
export function PickerDataProvider({ children }: { children: ReactNode }) {
  const tiles = useTiles()
  const activities = useActivityHierarchy()
  return <PickerDataContext.Provider value={{ tiles, activities }}>{children}</PickerDataContext.Provider>
}

export function usePickerData(): PickerDataContextValue {
  const value = useContext(PickerDataContext)
  if (!value) throw new Error('usePickerData must be used inside a <PickerDataProvider>')
  return value
}
