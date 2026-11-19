/**
 * Categories for the State Tiles — the rules, as pure functions.
 *
 * An account's layout is an ordered list of named categories, each holding an
 * ordered list of tile numbers. Every tile the account owns appears in exactly
 * one category, hidden tiles included (so Restore puts a tile back where it
 * was). The same shape and name rules as the header buttons' categories; the
 * backend (`set_reflection_card_layout`) enforces them too.
 */
import { normalizeCardOrder } from '@/domain/reflectionCardOrder'
import { MAX_GROUP_NAME_LENGTH, type HeaderButtonGroup, type HeaderButtonLayout } from '@/domain/headerButtons'

export interface CardGroup {
  id: string
  name: string
  cards: number[]
}

export const DEFAULT_CARD_GROUP_NAME = 'Tiles'
/** The stand-in category an account has until it makes its own. A fixed, valid uuid, so it can be saved as it is. */
export const DEFAULT_CARD_GROUP_ID = '00000000-0000-4000-8000-000000000000'
export const MAX_CARD_GROUPS = 50
export { MAX_GROUP_NAME_LENGTH as MAX_CARD_GROUP_NAME_LENGTH }

/** One category holding every tile in `order`. */
export function defaultCardGroups(order: readonly number[]): CardGroup[] {
  return [{ id: DEFAULT_CARD_GROUP_ID, name: DEFAULT_CARD_GROUP_NAME, cards: [...order] }]
}

/**
 * A stored layout made safe. Unknown, duplicate or malformed entries are
 * dropped; a tile left out of every category is appended to the first one (in
 * `order`), so a tile can never go missing; no categories at all → the default
 * one. `order` is the account's full tile order and decides which tiles exist.
 */
export function normalizeCardGroups(value: unknown, order: readonly number[], custom: readonly number[] = []): CardGroup[] {
  const all = normalizeCardOrder(order, custom)
  const allowed = new Set(all)
  const seenCards = new Set<number>()
  const seenIds = new Set<string>()
  const out: CardGroup[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) continue
      const { id, name, cards } = entry as Record<string, unknown>
      if (typeof id !== 'string' || id === '' || seenIds.has(id)) continue
      if (typeof name !== 'string' || name.trim() === '') continue
      seenIds.add(id)
      const kept: number[] = []
      if (Array.isArray(cards)) {
        for (const c of cards) {
          if (typeof c === 'number' && allowed.has(c) && !seenCards.has(c)) {
            seenCards.add(c)
            kept.push(c)
          }
        }
      }
      out.push({ id, name: name.trim().slice(0, MAX_GROUP_NAME_LENGTH), cards: kept })
    }
  }
  if (out.length === 0) return defaultCardGroups(all)
  const missing = all.filter((c) => !seenCards.has(c))
  if (missing.length > 0) out[0] = { ...out[0]!, cards: [...out[0]!.cards, ...missing] }
  return out
}

/** Every tile, category by category — the plain order the rest of the app reads. */
export function flattenCardGroups(groups: readonly CardGroup[]): number[] {
  return groups.flatMap((g) => g.cards)
}

/** The shown tiles of each category (hidden ones taken out), as the drag layout. */
export function cardLayout(groups: readonly CardGroup[], hidden: readonly number[]): HeaderButtonLayout {
  const gone = new Set(hidden)
  return groups.map((g) => ({ groupId: g.id, buttonIds: g.cards.filter((c) => !gone.has(c)).map(String) }))
}

/**
 * The categories after the user rearranges what they can see. Each category
 * takes the layout's tiles in the layout's order; its hidden tiles stay in it
 * (at the end), so a restored tile returns to its own category. A category
 * missing from the layout is left as it was.
 */
export function applyCardLayout(groups: readonly CardGroup[], hidden: readonly number[], layout: HeaderButtonLayout): CardGroup[] {
  const gone = new Set(hidden)
  const placed = new Map(layout.map((entry) => [entry.groupId, entry.buttonIds.map(Number).filter((c) => !gone.has(c))]))
  const next = groups.map((g) => {
    const shown = placed.get(g.id)
    if (!shown) return g
    return { ...g, cards: [...shown, ...g.cards.filter((c) => gone.has(c) && !shown.includes(c))] }
  })
  // Anything the layout didn't mention keeps its category: put back at the end of the one it was in.
  const seen = new Set(flattenCardGroups(next))
  return next.map((g, i) => {
    const lost = groups[i]!.cards.filter((c) => !seen.has(c))
    lost.forEach((c) => seen.add(c))
    return lost.length > 0 ? { ...g, cards: [...g.cards, ...lost] } : g
  })
}

export function groupOfCard(groups: readonly CardGroup[], card: number): CardGroup | undefined {
  return groups.find((g) => g.cards.includes(card))
}

/** The tap equivalent of dragging a tile into another category: it goes to the end of that category. */
export function moveCardToGroup(groups: readonly CardGroup[], card: number, groupId: string): CardGroup[] {
  if (!groups.some((g) => g.id === groupId) || !groupOfCard(groups, card)) return [...groups]
  return groups.map((g) => {
    const without = g.cards.filter((c) => c !== card)
    return g.id === groupId ? { ...g, cards: [...without, card] } : { ...g, cards: without }
  })
}

/** A brand-new tile goes to the end of `groupId` (the first category if it is unknown). */
export function addCardToGroup(groups: readonly CardGroup[], card: number, groupId?: string): CardGroup[] {
  const target = groups.some((g) => g.id === groupId) ? groupId : groups[0]?.id
  return groups.map((g) => (g.id === target && !g.cards.includes(card) ? { ...g, cards: [...g.cards, card] } : g))
}

export function addCardGroup(groups: readonly CardGroup[], id: string, name: string): CardGroup[] {
  if (groups.length >= MAX_CARD_GROUPS) return [...groups]
  return [...groups, { id, name: name.trim(), cards: [] }]
}

export function renameCardGroup(groups: readonly CardGroup[], id: string, name: string): CardGroup[] {
  return groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g))
}

/** Deleting a category never deletes tiles: they move to the end of `moveToId` (or the first remaining category). The last category can't be deleted. */
export function deleteCardGroup(groups: readonly CardGroup[], id: string, moveToId?: string): CardGroup[] {
  const leaving = groups.find((g) => g.id === id)
  const remaining = groups.filter((g) => g.id !== id)
  if (!leaving || remaining.length === 0) return [...groups]
  const target = remaining.find((g) => g.id === moveToId)?.id ?? remaining[0]!.id
  return remaining.map((g) => (g.id === target ? { ...g, cards: [...g.cards, ...leaving.cards] } : g))
}

/** A category moved one step up (`-1`) or down (`1`); at either end it stays put. */
export function moveCardGroup(groups: readonly CardGroup[], id: string, delta: -1 | 1): CardGroup[] {
  const from = groups.findIndex((g) => g.id === id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= groups.length) return [...groups]
  const next = [...groups]
  ;[next[from], next[to]] = [next[to]!, next[from]!]
  return next
}

/** The shape the shared category controls (heading, add-category form, name rules) take. */
export function asCategoryGroups(groups: readonly CardGroup[]): HeaderButtonGroup[] {
  return groups.map((g, index) => ({ id: g.id, name: g.name, sortOrder: index }))
}

export function isCardGroupsEqual(a: readonly CardGroup[], b: readonly CardGroup[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
