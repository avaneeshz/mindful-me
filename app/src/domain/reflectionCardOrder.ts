/**
 * The order the 18 State Tiles are shown in — the rules, as pure functions.
 * An account's order is always a full permutation of 1..18; anything
 * stored that isn't one is repaired rather than trusted. The backend
 * enforces the same shape in `set_reflection_card_order`.
 */
export const CARD_COUNT = 18

export const DEFAULT_CARD_ORDER: readonly number[] = Array.from({ length: CARD_COUNT }, (_, i) => i + 1)

/** The most custom tiles one account can add (the database enforces the same cap). */
export const MAX_CUSTOM_CARDS = 50

/** Custom tiles are numbered 19 and up, per account. */
export function isCustomCard(card: number): boolean {
  return Number.isInteger(card) && card > CARD_COUNT
}

/**
 * A stored order made safe: unknown, duplicate or out-of-range entries are
 * dropped, and any tile left out is appended — the built-in tiles in their
 * built-in order, then this account's custom tiles (`custom`) ascending — so
 * a tile can never go missing from the grid and a newly added one lands last.
 */
export function normalizeCardOrder(value: unknown, custom: readonly number[] = []): number[] {
  const allowed = new Set<number>([...DEFAULT_CARD_ORDER, ...custom.filter(isCustomCard)])
  const seen = new Set<number>()
  const out: number[] = []
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === 'number' && allowed.has(v) && !seen.has(v)) {
        seen.add(v)
        out.push(v)
      }
    }
  }
  const missing = [...allowed].filter((card) => !seen.has(card)).sort((a, b) => a - b)
  return [...out, ...missing]
}

/** The next custom tile number for a device with no backend: one past the highest in use. */
export function nextCustomCardNumber(custom: readonly number[]): number {
  return Math.max(CARD_COUNT, ...custom) + 1
}

/** `card` placed at `toIndex` (clamped) — a drag, and the tap equivalent. An unknown card returns the order unchanged. */
export function moveCardTo(order: readonly number[], card: number, toIndex: number): number[] {
  if (!order.includes(card)) return [...order]
  const without = order.filter((c) => c !== card)
  const at = Math.max(0, Math.min(toIndex, without.length))
  return [...without.slice(0, at), card, ...without.slice(at)]
}

/** `card` moved one step earlier (`-1`) or later (`1`); at either end it stays put. */
export function moveCardBy(order: readonly number[], card: number, delta: -1 | 1): number[] {
  const from = order.indexOf(card)
  if (from === -1) return [...order]
  return moveCardTo(order, card, from + delta)
}

export function isDefaultOrder(order: readonly number[]): boolean {
  return order.length === CARD_COUNT && order.every((c, i) => c === DEFAULT_CARD_ORDER[i])
}

export function sameOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i])
}
