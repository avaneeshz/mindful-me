import { supabase } from '@/lib/supabaseClient'

/**
 * Top-level catalog card name <-> `activities.id` mapping. `scheduled_
 * activities.activity_id` references the TOP-LEVEL card row only — the
 * drill-down `path` (e.g. ["Oiling", "Body"]) stays plain text, exactly as
 * the client has always stored it, so no sub-option lookup is needed here.
 *
 * Fetched once per session and cached in memory: the catalog is close to
 * static content (see `data/activities.ts`), and every read here is already
 * behind `list_scheduled_activities`'s own per-window fetch, not a hot path.
 */
interface CatalogMaps {
  byName: Map<string, string>
  byId: Map<string, string>
}

let cache: CatalogMaps | null = null
let inFlight: Promise<CatalogMaps> | null = null

async function fetchCatalog(): Promise<CatalogMaps> {
  const byName = new Map<string, string>()
  const byId = new Map<string, string>()
  if (!supabase) return { byName, byId }

  const { data, error } = await supabase.from('activities').select('id, name').is('parent_id', null)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[catalog] failed to load activity catalog — sync will stall until it does', error.message)
    return { byName, byId }
  }
  for (const row of data ?? []) {
    byName.set(row.name, row.id)
    byId.set(row.id, row.name)
  }
  return { byName, byId }
}

async function load(): Promise<CatalogMaps> {
  if (cache) return cache
  if (!inFlight) inFlight = fetchCatalog()
  cache = await inFlight
  return cache
}

/** The catalog row id for a top-level card name, or null (e.g. offline, not yet loaded). */
export async function catalogIdForName(name: string): Promise<string | null> {
  const { byName } = await load()
  return byName.get(name) ?? null
}

/** The top-level card name for a catalog row id. */
export async function nameForCatalogId(id: string): Promise<string | null> {
  const { byId } = await load()
  return byId.get(id) ?? null
}

/** Test-only: drop the cached catalog so the next call refetches. */
export function resetCatalogCache(): void {
  cache = null
  inFlight = null
}
