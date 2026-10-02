import { describe, expect, it } from 'vitest'
import {
  COLOR_PRESETS,
  effectiveActivityColor,
  loggedActivityColor,
  normalizeHexColor,
  readableInkOn,
  rowForLoggedActivity,
} from './colors'
import type { ActivityRow } from './pickerHierarchy'

function row(overrides: Partial<ActivityRow> & Pick<ActivityRow, 'id' | 'name'>): ActivityRow {
  return {
    tileId: null,
    parentId: null,
    iconKey: null,
    hidden: false,
    sortOrder: 0,
    disappearMode: 'manual',
    disappearLimit: null,
    color: null,
    ...overrides,
  }
}

const tiles = [
  { id: 'work', color: '#3e63dd' },
  { id: 'home', color: null },
]

const rows: ActivityRow[] = [
  row({ id: 'focus', name: 'Focus work', tileId: 'work' }),
  row({ id: 'deep', name: 'Deep work', parentId: 'focus', color: '#e5484d' }),
  row({ id: 'coding', name: 'Coding', parentId: 'deep' }),
  row({ id: 'shallow', name: 'Shallow work', parentId: 'focus' }),
  row({ id: 'chores', name: 'Chores', tileId: 'home' }),
  row({ id: 'laundry', name: 'Laundry', parentId: 'chores', color: '#46a758' }),
]

describe('normalizeHexColor', () => {
  it('normalizes case, shorthand and a missing #', () => {
    expect(normalizeHexColor('#3E63DD')).toBe('#3e63dd')
    expect(normalizeHexColor('3e63dd')).toBe('#3e63dd')
    expect(normalizeHexColor(' #abc ')).toBe('#aabbcc')
  })

  it('rejects anything that is not a hex colour', () => {
    expect(normalizeHexColor('')).toBeNull()
    expect(normalizeHexColor(null)).toBeNull()
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('#12345')).toBeNull()
    expect(normalizeHexColor('#gggggg')).toBeNull()
  })

  it('every preset is already normalized (matches the DB CHECK)', () => {
    for (const preset of COLOR_PRESETS) expect(preset).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('readableInkOn', () => {
  it('picks white on dark fills and black on light ones', () => {
    expect(readableInkOn('#000000')).toBe('#ffffff')
    expect(readableInkOn('#1f3a5f')).toBe('#ffffff')
    expect(readableInkOn('#ffffff')).toBe('#000000')
    expect(readableInkOn('#ffe08a')).toBe('#000000')
  })
})

describe('effectiveActivityColor', () => {
  it('uses the activity’s own colour first', () => {
    expect(effectiveActivityColor(rows, tiles, 'deep')).toBe('#e5484d')
  })

  it('inherits from the nearest coloured ancestor', () => {
    expect(effectiveActivityColor(rows, tiles, 'coding')).toBe('#e5484d')
  })

  it('falls back to the tile’s colour', () => {
    expect(effectiveActivityColor(rows, tiles, 'shallow')).toBe('#3e63dd')
    expect(effectiveActivityColor(rows, tiles, 'focus')).toBe('#3e63dd')
  })

  it('is null when nothing in the chain is coloured', () => {
    expect(effectiveActivityColor(rows, tiles, 'chores')).toBeNull()
    expect(effectiveActivityColor(rows, tiles, 'missing')).toBeNull()
  })

  it('survives a parentId cycle', () => {
    const cyclic = [row({ id: 'a', name: 'A', parentId: 'b' }), row({ id: 'b', name: 'B', parentId: 'a' })]
    expect(effectiveActivityColor(cyclic, tiles, 'a')).toBeNull()
  })
})

describe('rowForLoggedActivity / loggedActivityColor', () => {
  it('walks the drill-down path by name', () => {
    expect(rowForLoggedActivity(rows, 'Focus work', ['Deep work', 'Coding'])?.id).toBe('coding')
    expect(loggedActivityColor(rows, tiles, 'Chores', ['Laundry'])).toBe('#46a758')
  })

  it('stops at the deepest segment that still exists', () => {
    expect(rowForLoggedActivity(rows, 'Focus work', ['Deep work', 'Renamed'])?.id).toBe('deep')
  })

  it('is null for a flag marker or unknown activity', () => {
    expect(loggedActivityColor(rows, tiles, null, [])).toBeNull()
    expect(loggedActivityColor(rows, tiles, 'Nope', [])).toBeNull()
  })
})
