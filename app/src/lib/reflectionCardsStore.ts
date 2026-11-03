import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import { parseCardNames, type ReflectionCardNames } from '@/domain/reflectionCardNames'

/**
 * Device cache of one account's State Tile names and pictures, so the grid
 * paints instantly on the next visit. Keyed by account so signing in as
 * someone else on the same device never shows the previous person's tiles.
 * The server is the source of truth; this is only a cache.
 */
export interface CardCustomization {
  names: ReflectionCardNames
  images: Readonly<Record<number, string>>
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

export function loadCardCustomization(owner: string): CardCustomization {
  const raw = readStoredJSON(keyFor(owner))
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return { names: parseCardNames(obj.names), images: parseCardImages(obj.images) }
}

export function saveCardCustomization(owner: string, value: CardCustomization): void {
  writeStoredJSON(keyFor(owner), value)
}
