import { describe, expect, it } from 'vitest'
import { DEFAULT_INTERFACE_MODE, parseInterfaceMode } from './interfaceMode'

describe('parseInterfaceMode', () => {
  it('reads a stored Lumen choice', () => {
    expect(parseInterfaceMode('lumen')).toBe('lumen')
  })

  it('falls back to Classic for anything else, including nothing stored', () => {
    expect(DEFAULT_INTERFACE_MODE).toBe('classic')
    expect(parseInterfaceMode(null)).toBe('classic')
    expect(parseInterfaceMode('classic')).toBe('classic')
    expect(parseInterfaceMode('LUMEN')).toBe('classic')
    expect(parseInterfaceMode('')).toBe('classic')
  })
})
