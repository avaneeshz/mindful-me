import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import { parseCardNames, type ReflectionCardNames } from '@/domain/reflectionCardNames'
import { isCustomCard, normalizeCardOrder, normalizeHiddenCards } from '@/domain/reflectionCardOrder'

/**
 * Device cache of one account's State Tile names and pictures, so the grid
 * paints instantly on the next visit. Keyed by account so signing in as
 * someone else on the same device never shows the previous person's tiles.
 * The server is the source of truth; this is only a cache.
 */
export interface CardCustomization {
  names: ReflectionCardNames
  images: Readonly<Record<number, string>>
  /** The order the tiles are shown in — always a full permutation of 1..18. */
  order: readonly number[]
  /** This account's own tiles (numbers 19 and up). */
  custom: readonly number[]
  /** Tiles the user deleted; shown again from Settings → Hidden items. */
  hidden: readonly number[]
}

const keyFor = (owner: string) => `mindful-me:state-tiles:${owner}`

export function parseCardImages(value: unknown): Record<number, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<number, string> = {}
  for (const [key, v] of Object.entries(value)) {
    const card = Number(key)
    if (Number.isInteger(card) && typeof v === 'string' && v.startsWith('data:image/')) out[card] = v
  }
  return out
}

export function parseCustomCards(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out = new Set<number>()
  for (const v of value) if (typeof v === 'number' && isCustomCard(v)) out.add(v)
  return [...out].sort((a, b) => a - b)
}

export function loadCardCustomization(owner: string): CardCustomization {
  const raw = readStoredJSON(keyFor(owner))
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const custom = parseCustomCards(obj.custom)
  return { names: parseCardNames(obj.names), images: parseCardImages(obj.images), order: normalizeCardOrder(obj.order, custom), custom, hidden: normalizeHiddenCards(obj.hidden, custom) }
}

export function saveCardCustomization(owner: string, value: CardCustomization): void {
  writeStoredJSON(keyFor(owner), value)
}
