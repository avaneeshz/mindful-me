import { useEffect } from 'react'
import { resetLiveActivityCatalog, setLiveActivityCatalog } from '@/data/activities'
import { liveActivityCardsFromRows, liveCategoriesFromTiles } from '@/domain/pickerHierarchy'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { useActivityHierarchy } from './useActivityHierarchy'
import { useTiles } from './useTiles'

/**
 * PICKER-CUSTOM-1's bridge from the real per-user backend
 * (`useTiles`/`useActivityHierarchy`) to the live-swappable catalog registry
 * `data/activities.ts` exposes (`setLiveActivityCatalog`) — the one place
 * this wiring happens, mounted once near the app root (`BoardContext.tsx`)
 * so `TileRow`/`LogActivityModal`/`domain/boardReducer.ts` all see the same
 * live data without any of them needing to know where it came from. Thin
 * glue only — the actual conversion (`liveCategoriesFromTiles`/
 * `liveActivityCardsFromRows`) is pure and tested in
 * `domain/pickerHierarchy.test.ts`; this effect itself has no test (this
 * repo's SSR-string test suite never runs effects — see
 * `.claude/agent-memory/full-stack-engineer/feedback_hook_testing_no_jsdom.md`).
 *
 * Deliberately does NOT call the setter at all until Supabase is configured
 * AND both hooks have genuinely finished their first load — rule 6 (zero
 * backend configured stays fully usable) is satisfied by simply leaving the
 * registry untouched in that case, so every lookup in `data/activities.ts`
 * keeps falling back to the exact static catalog it always has, byte for
 * byte, rather than trying to reconcile a second, less-faithful "local-only
 * preview" shape with it (see `useActivityHierarchy`'s own local-only
 * preview, which exists for the Activity Library editor, not for this).
 */
export function useLiveActivityCatalogSync(): void {
  const tiles = useTiles()
  const activities = useActivityHierarchy()

  useEffect(() => {
    if (!supabaseConfigured) return
    if (tiles.status !== 'ready' || activities.status !== 'ready') return
    if (tiles.tiles.length === 0) return

    const { categories, order } = liveCategoriesFromTiles(tiles.tiles)
    const cards = liveActivityCardsFromRows(activities.activities, order)
    setLiveActivityCatalog(categories, order, cards)
  }, [tiles.status, tiles.tiles, activities.status, activities.activities])

  // Cleanup on unmount only, not on every dependency change — this hook is
  // meant to be mounted exactly once, for the app's whole lifetime.
  useEffect(() => {
    return () => resetLiveActivityCatalog()
  }, [])
}
