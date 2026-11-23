import { describe, expect, it } from 'vitest'
import { FRAME_NAME_MAX, frameDisplayName, normalizeFrameName, parseFrameNames } from './frameNames'

describe('normalizeFrameName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeFrameName('  Work   life ')).toBe('Work life')
  })
  it('treats empty as "use the default"', () => {
    expect(normalizeFrameName('')).toBeNull()
    expect(normalizeFrameName('   ')).toBeNull()
  })
  it('cuts to the limit without splitting a character', () => {
    const long = '😀'.repeat(FRAME_NAME_MAX + 5)
    expect(Array.from(normalizeFrameName(long) ?? '').length).toBe(FRAME_NAME_MAX)
  })
})

describe('frameDisplayName', () => {
  it('falls back to the numbered default', () => {
    expect(frameDisplayName(2, {})).toBe('Frame 2')
    expect(frameDisplayName(2, { 2: 'Home' })).toBe('Home')
    expect(frameDisplayName(3, { 2: 'Home' })).toBe('Frame 3')
  })
})

describe('parseFrameNames', () => {
  it('keeps only usable names for frames 1-4', () => {
    expect(parseFrameNames({ 1: ' A ', 2: '', 5: 'x', 3: 7, foo: 'y' })).toEqual({ 1: 'A' })
    expect(parseFrameNames(null)).toEqual({})
    expect(parseFrameNames([1, 2])).toEqual({})
  })
})
