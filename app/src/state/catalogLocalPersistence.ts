import type { AttributeOverrideRow, CatalogActivityRow, CatalogCategoryRow } from '@/domain/catalog'

/**
 * Local-first cache for the catalog's DB-shaped rows (rule 6, same contract
 * `state/localPersistence.ts` gives the board) — instant on load, background-
 * refreshed from Supabase by `CatalogContext`, and used verbatim (system
 * default only) when nothing has ever synced yet. Unlike the board cache,
 * this is NOT namespaced per calendar day: the catalog is the same regardless
 * of which day is being viewed.
 */

const STORAGE_KEY = 'mindful-me:catalog:v1'

export interface CatalogCachePayload {
  categories: CatalogCategoryRow[]
  activities: CatalogActivityRow[]
  overrides: AttributeOverrideRow[]
}

function isCachePayload(value: unknown): value is CatalogCachePayload {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.categories) && Array.isArray(v.activities) && Array.isArray(v.overrides)
}

/** Fails closed (never throws) — a private-browsing tab, a full quota, or storage blocked by
 * policy degrades to "nothing cached yet" (the caller falls back to the system default catalog). */
export function loadCatalogCache(): CatalogCachePayload | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isCachePayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveCatalogCache(payload: CatalogCachePayload): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}
