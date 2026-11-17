import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CARD_ORDER,
  isDefaultOrder,
  moveCardBy,
  moveCardTo,
  normalizeCardOrder,
  sameOrder,
} from './reflectionCardOrder'

describe('normalizeCardOrder', () => {
  it('returns the built-in order for nothing stored', () => {
    expect(normalizeCardOrder(undefined)).toEqual([...DEFAULT_CARD_ORDER])
    expect(normalizeCardOrder('x')).toEqual([...DEFAULT_CARD_ORDER])
  })

  it('keeps a valid permutation exactly', () => {
    const order = [18, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
    expect(normalizeCardOrder(order)).toEqual(order)
  })

  it('drops duplicates, strangers and non-numbers, and appends missing tiles', () => {
    const result = normalizeCardOrder([9, 9, 0, 19, 'a', 1.5, 3])
    expect(result.slice(0, 2)).toEqual([9, 3])
    expect([...result].sort((a, b) => a - b)).toEqual([...DEFAULT_CARD_ORDER])
    expect(result).toHaveLength(18)
  })
})

describe('moving tiles', () => {
  it('moves a tile to an index, clamped to the ends', () => {
    expect(moveCardTo([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3])
    expect(moveCardTo([1, 2, 3, 4], 1, 99)).toEqual([2, 3, 4, 1])
    expect(moveCardTo([1, 2, 3, 4], 2, -5)).toEqual([2, 1, 3, 4])
  })

  it('moves by one step and stays put at the ends', () => {
    expect(moveCardBy([1, 2, 3], 2, -1)).toEqual([2, 1, 3])
    expect(moveCardBy([1, 2, 3], 2, 1)).toEqual([1, 3, 2])
    expect(moveCardBy([1, 2, 3], 1, -1)).toEqual([1, 2, 3])
    expect(moveCardBy([1, 2, 3], 3, 1)).toEqual([1, 2, 3])
  })

  it('leaves the order alone for an unknown tile', () => {
    expect(moveCardTo([1, 2, 3], 9, 0)).toEqual([1, 2, 3])
    expect(moveCardBy([1, 2, 3], 9, 1)).toEqual([1, 2, 3])
  })

  it('does not mutate its input', () => {
    const order = [1, 2, 3]
    moveCardTo(order, 3, 0)
    expect(order).toEqual([1, 2, 3])
  })
})

describe('order comparison', () => {
  it('recognises the built-in order and equal orders', () => {
    expect(isDefaultOrder([...DEFAULT_CARD_ORDER])).toBe(true)
    expect(isDefaultOrder(moveCardTo([...DEFAULT_CARD_ORDER], 9, 0))).toBe(false)
    expect(sameOrder([1, 2], [1, 2])).toBe(true)
    expect(sameOrder([1, 2], [2, 1])).toBe(false)
  })
})
