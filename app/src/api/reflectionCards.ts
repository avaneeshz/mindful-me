import { supabase } from '@/lib/supabaseClient'

/**
 * `data/reflectionCards.ts`'s static `number` (1–18, always available
 * offline) <-> `reflection_cards.id` mapping — the exact same shape
 * `api/catalog.ts`'s `catalogIdForName`/`nameForCatalogId` already provides
 * for the activity catalog, for the same reason: `ScheduledActivity.
 * reflections` identifies a card by the static catalog's own number (rule
 * 6 — the client stays fully usable with zero backend), and this is the one
 * place that number is translated to/from the real DB id, only at the sync
 * boundary (`api/scheduledActivities.ts`).
 *
 * Fetched once per session and cached in memory — the reflection catalog is
 * static content, same reasoning `api/catalog.ts`'s own cache gives.
 */
interface ReflectionCardMaps {
  byNumber: Map<number, string>
  byId: Map<string, number>
}

let cache: ReflectionCardMaps | null = null
let inFlight: Promise<ReflectionCardMaps> | null = null

async function fetchReflectionCards(): Promise<ReflectionCardMaps> {
  const byNumber = new Map<number, string>()
  const byId = new Map<string, number>()
  if (!supabase) return { byNumber, byId }

  const { data, error } = await supabase.from('reflection_cards').select('id, number').is('created_by', null)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[reflectionCards] failed to load reflection card catalog — sync will stall until it does', error.message)
    return { byNumber, byId }
  }
  for (const row of data ?? []) {
    byNumber.set(row.number, row.id)
    byId.set(row.id, row.number)
  }
  return { byNumber, byId }
}

async function load(): Promise<ReflectionCardMaps> {
  if (cache) return cache
  if (!inFlight) inFlight = fetchReflectionCards()
  cache = await inFlight
  return cache
}

/** The `reflection_cards` row id for a static catalog number, or null (e.g. offline, not yet loaded). */
export async function reflectionCardIdForNumber(number: number): Promise<string | null> {
  const { byNumber } = await load()
  return byNumber.get(number) ?? null
}

/** The static catalog number for a `reflection_cards` row id. */
export async function numberForReflectionCardId(id: string): Promise<number | null> {
  const { byId } = await load()
  return byId.get(id) ?? null
}

/** Test-only: drop the cached catalog so the next call refetches. */
export function resetReflectionCardCache(): void {
  cache = null
  inFlight = null
}
