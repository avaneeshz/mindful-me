import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  buildAttributeOverrideMap,
  buildSnapshotFromRows,
  defaultCatalogRows,
  defaultCatalogSnapshot,
  type AttributeOverrideMap,
  type AttributeOverrideRow,
  type CatalogActivityRow,
  type CatalogCategoryRow,
  type CatalogSnapshot,
} from '@/domain/catalog'
import { apiGetEffectiveCatalog, type EffectiveCatalogPayload } from '@/api/catalog'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { loadCatalogCache, saveCatalogCache } from './catalogLocalPersistence'

/**
 * The one source of truth for the EFFECTIVE catalog (system defaults merged
 * with the user's own tiles/cards/subs/thirds and attribute-option
 * overrides) from now on — see the full-stack-engineer agent definition's
 * "Catalog Customization" section. Every current direct importer of
 * `CATEGORIES`/`CATEGORY_ORDER`/`ACTIVITY_CARDS`/`cardsForCategory` reads
 * through this context instead; `data/activities.ts` itself is untouched and
 * is now purely the default-seed module `defaultCatalogSnapshot` converts.
 *
 * Local-first, exactly like `BoardContext` (rule 6): the DB-shaped rows load
 * synchronously from a `localStorage` cache on mount (instant, no flash of
 * "only the system catalog" for a user who has customized it), then a
 * background fetch reconciles against the server — never the other way
 * around, and a server outage never blocks the app from working (falls back
 * to whatever was last cached, or the system default if nothing ever was).
 */
interface CatalogContextValue {
  /** The flat, render-ready shape `TileRow`/`LogActivityModal`/`boardReducer` consume. */
  snapshot: CatalogSnapshot
  /** Raw DB-shaped rows — what the Configuration screen's tree editor works from. */
  categoryRows: CatalogCategoryRow[]
  activityRows: CatalogActivityRow[]
  overrideRows: AttributeOverrideRow[]
  /** Card name -> allowed option ids per attribute type — what the log-activity pickers filter by. */
  attributeOverrides: AttributeOverrideMap
  /** True until the very first load (cache or default) has resolved — practically instant, never a spinner. */
  ready: boolean
  /**
   * Applies a new effective row set immediately (optimistic local-first
   * write, rule 6) and persists it to the local cache — the Configuration
   * screen's Save action calls this the instant it commits, before any of
   * its background RPC calls for the individual staged operations resolve.
   */
  applyEffectiveCatalog: (payload: EffectiveCatalogPayload) => void
  /** Re-fetches from the server and merges in, same as the background effect on mount. */
  refresh: () => void
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

function toCachePayload(payload: EffectiveCatalogPayload) {
  return { categories: payload.categories, activities: payload.activities, overrides: payload.overrides }
}

/**
 * No local cache yet (a genuinely first-ever run, or local-only mode with no
 * backend configured at all — rule 6) -> the system default catalog, in its
 * DB-shaped ROW form (`defaultCatalogRows`) rather than an empty array. This
 * is what makes `categoryRows`/`activityRows` a reliable non-empty baseline
 * for `SettingsPage`'s own staged editor to start from — without it, a
 * first-time or offline-only user would see an empty "no tiles yet"
 * Configuration screen while Home correctly shows all 9 tiles (`snapshot`'s
 * own `defaultCatalogSnapshot()` fallback covers the READ side already; this
 * covers the EDIT side the same way).
 */
function initialCatalogCache() {
  return loadCatalogCache() ?? { ...defaultCatalogRows(), overrides: [] }
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  // Computed exactly once per provider instance (a `ref` guard, not three
  // independent lazy `useState` initializers) — `initialCatalogCache()` reads
  // `localStorage` and, on a cache miss, builds the default catalog's row
  // form; nothing about it needs to run more than once per mount.
  const initialRef = useRef<ReturnType<typeof initialCatalogCache> | null>(null)
  if (initialRef.current === null) initialRef.current = initialCatalogCache()
  const initial = initialRef.current

  const [categoryRows, setCategoryRows] = useState<CatalogCategoryRow[]>(initial.categories)
  const [activityRows, setActivityRows] = useState<CatalogActivityRow[]>(initial.activities)
  const [overrideRows, setOverrideRows] = useState<AttributeOverrideRow[]>(initial.overrides)
  const [ready, setReady] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const remote = await apiGetEffectiveCatalog()
      if (cancelled) return
      if (remote) {
        setCategoryRows(remote.categories)
        setActivityRows(remote.activities)
        setOverrideRows(remote.overrides)
        saveCatalogCache(toCachePayload(remote))
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  function applyEffectiveCatalog(payload: EffectiveCatalogPayload): void {
    setCategoryRows(payload.categories)
    setActivityRows(payload.activities)
    setOverrideRows(payload.overrides)
    saveCatalogCache(toCachePayload(payload))
  }

  function refresh(): void {
    setRefreshToken((n) => n + 1)
  }

  // No rows cached or synced yet (first-ever run, or genuinely offline with
  // nothing to sync from) -> the system default catalog, exactly like
  // `BoardContext`'s own "first-ever run falls back to seed content" rule —
  // never an empty tile row.
  const snapshot = useMemo<CatalogSnapshot>(
    () => (categoryRows.length > 0 ? buildSnapshotFromRows(categoryRows, activityRows) : defaultCatalogSnapshot()),
    [categoryRows, activityRows],
  )

  const attributeOverrides = useMemo(
    () => buildAttributeOverrideMap(activityRows, overrideRows),
    [activityRows, overrideRows],
  )

  const value = useMemo<CatalogContextValue>(
    () => ({
      snapshot,
      categoryRows,
      activityRows,
      overrideRows,
      attributeOverrides,
      ready,
      applyEffectiveCatalog,
      refresh,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, categoryRows, activityRows, overrideRows, attributeOverrides, ready],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext)
  if (!value) throw new Error('useCatalog must be used inside a <CatalogProvider>')
  return value
}
