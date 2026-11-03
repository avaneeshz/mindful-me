import { describe, expect, it } from 'vitest'
import { MAX_CARD_NAME_LENGTH, parseCardNames, resolveCardName, validateCardName, withCardName } from './reflectionCardNames'

describe('reflectionCardNames', () => {
  it('rejects empty and over-long names', () => {
    expect(validateCardName('   ')).not.toBeNull()
    expect(validateCardName('x'.repeat(MAX_CARD_NAME_LENGTH + 1))).not.toBeNull()
    expect(validateCardName(' Calm  ')).toBeNull()
  })
  it('falls back to the default title', () => {
    expect(resolveCardName({}, 1, 'Somatic')).toBe('Somatic')
    expect(resolveCardName({ 1: 'Body' }, 1, 'Somatic')).toBe('Body')
  })
  it('stores a trimmed override and clears it when set back to the default', () => {
    const renamed = withCardName({}, 1, '  My   body ', 'Somatic')
    expect(renamed).toEqual({ 1: 'My body' })
    expect(withCardName(renamed, 1, 'Somatic', 'Somatic')).toEqual({})
  })
  it('drops malformed stored data', () => {
    expect(parseCardNames(null)).toEqual({})
    expect(parseCardNames([1])).toEqual({})
    expect(parseCardNames({ 2: 'Ok', 3: 5, x: 'Bad', 4: '' })).toEqual({ 2: 'Ok' })
  })
})
