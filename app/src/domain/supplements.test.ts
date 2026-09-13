import { describe, expect, it } from 'vitest'
import { emptyCompletion, fullDayChecklist, SUPPLEMENT_ITEMS, supplementItemLabel } from './supplements'
import type { SupplementCompletion } from './supplements'

describe('SUPPLEMENT_ITEMS', () => {
  it('is the fixed 7-item checklist, in the confirmed order', () => {
    expect(SUPPLEMENT_ITEMS.map((item) => item.key)).toEqual([
      'zinc',
      'omega',
      'magnesium',
      'ayurveda_skin',
      'ayurveda_fibroid',
      'ayurveda_varicose',
      'multivitamin',
    ])
  })

  it('has no duplicate keys', () => {
    const keys = SUPPLEMENT_ITEMS.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('supplementItemLabel', () => {
  it('resolves every real key to its label', () => {
    for (const { key, label } of SUPPLEMENT_ITEMS) {
      expect(supplementItemLabel(key)).toBe(label)
    }
  })
})

describe('emptyCompletion', () => {
  it('is unchecked, with no note and no completedAt — "resets daily" is exactly this shape', () => {
    expect(emptyCompletion('zinc', '2026-09-13')).toEqual({
      itemKey: 'zinc',
      localDate: '2026-09-13',
      done: false,
      note: '',
      completedAt: null,
    })
  })
})

describe('fullDayChecklist', () => {
  it('fills every item with an empty completion when nothing has been touched that day', () => {
    const checklist = fullDayChecklist('2026-09-13', [])
    expect(checklist).toHaveLength(SUPPLEMENT_ITEMS.length)
    expect(checklist.every((entry) => !entry.done)).toBe(true)
  })

  it('keeps SUPPLEMENT_ITEMS’ own order regardless of the order rows arrived in', () => {
    const existing: SupplementCompletion[] = [
      { itemKey: 'multivitamin', localDate: '2026-09-13', done: true, note: '', completedAt: '2026-09-13T08:00:00Z' },
      { itemKey: 'zinc', localDate: '2026-09-13', done: true, note: '', completedAt: '2026-09-13T07:00:00Z' },
    ]
    const checklist = fullDayChecklist('2026-09-13', existing)
    expect(checklist.map((entry) => entry.itemKey)).toEqual(SUPPLEMENT_ITEMS.map((item) => item.key))
  })

  it('substitutes a real row for its own item, leaving every other item unchecked', () => {
    const existing: SupplementCompletion[] = [
      { itemKey: 'omega', localDate: '2026-09-13', done: true, note: 'With lunch.', completedAt: '2026-09-13T13:00:00Z' },
    ]
    const checklist = fullDayChecklist('2026-09-13', existing)
    const omega = checklist.find((entry) => entry.itemKey === 'omega')
    expect(omega).toEqual(existing[0])
    expect(checklist.filter((entry) => entry.done)).toHaveLength(1)
  })

  it('never fabricates a row for a stale/unknown itemKey beyond the 7 real items', () => {
    const checklist = fullDayChecklist('2026-09-13', [])
    const keys = checklist.map((entry) => entry.itemKey)
    expect(keys).toEqual(SUPPLEMENT_ITEMS.map((item) => item.key))
  })
})
