/** Longest custom State Tile name. Keeps two lines of card caption readable. */
export const MAX_CARD_NAME_LENGTH = 30

export type ReflectionCardNames = Readonly<Record<number, string>>

/** Trim and collapse whitespace; the stored/compared form of a typed name. */
export function normalizeCardName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Why a typed name can't be saved, or `null` when it can. */
export function validateCardName(raw: string): string | null {
  const name = normalizeCardName(raw)
  if (name === '') return 'Give the tile a name.'
  if (name.length > MAX_CARD_NAME_LENGTH) return `Keep it to ${MAX_CARD_NAME_LENGTH} characters or fewer.`
  return null
}

/** The name to show: the user's own if they set one, otherwise the built-in title. */
export function resolveCardName(names: ReflectionCardNames, card: number, defaultTitle: string): string {
  return names[card] ?? defaultTitle
}

/** Returns a new map with `card` renamed. A name equal to the default clears the override. */
export function withCardName(names: ReflectionCardNames, card: number, raw: string, defaultTitle: string): ReflectionCardNames {
  const name = normalizeCardName(raw)
  const next = { ...names }
  if (name === '' || name === defaultTitle) delete next[card]
  else next[card] = name
  return next
}

/** Reads a stored value defensively: anything malformed is dropped. */
export function parseCardNames(value: unknown): ReflectionCardNames {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<number, string> = {}
  for (const [key, v] of Object.entries(value)) {
    const card = Number(key)
    if (Number.isInteger(card) && typeof v === 'string' && validateCardName(v) === null) out[card] = normalizeCardName(v)
  }
  return out
}
