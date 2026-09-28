import { describe, expect, it } from 'vitest'
import { describeAccount } from './account'

describe('describeAccount', () => {
  it('derives a first name and two initials from a dotted email', () => {
    expect(describeAccount('maya.rivera@example.com')).toEqual({ firstName: 'Maya', initials: 'MR' })
  })

  it('handles a single-word local part', () => {
    expect(describeAccount('AVA@example.com')).toEqual({ firstName: 'Ava', initials: 'A' })
  })

  it('skips purely numeric pieces', () => {
    expect(describeAccount('ava.keshri+99@example.com')).toEqual({ firstName: 'Ava', initials: 'AK' })
  })

  it('returns nothing to show without a usable email', () => {
    expect(describeAccount(null)).toEqual({ firstName: null, initials: '' })
    expect(describeAccount('1234@example.com')).toEqual({ firstName: null, initials: '' })
  })
})
