import { describe, expect, it } from 'vitest'
import {
  checkIconDimensions,
  checkIconFile,
  customIconIdFromKey,
  customIconKey,
  opaqueShare,
  removePlainBackground,
  toSilhouette,
} from './customIcons'

/** A w×h RGBA image filled with `bg`, with an opaque `fg` square at [from, to). */
function image(w: number, h: number, bg: number[], fg?: { color: number[]; from: number; to: number }) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = fg && x >= fg.from && x < fg.to && y >= fg.from && y < fg.to
      const c = inside ? fg.color : bg
      data.set(c, (y * w + x) * 4)
    }
  }
  return data
}
const alphaAt = (data: Uint8ClampedArray, w: number, x: number, y: number) => data[(y * w + x) * 4 + 3]

describe('custom icon keys', () => {
  it('round-trips an id', () => {
    expect(customIconIdFromKey(customIconKey('abc'))).toBe('abc')
  })
  it('is null for built-in icons', () => {
    expect(customIconIdFromKey('Moon')).toBeNull()
    expect(customIconIdFromKey(null)).toBeNull()
  })
})

describe('checkIconFile', () => {
  it('accepts PNG and SVG up to 200 KB', () => {
    expect(checkIconFile({ type: 'image/png', size: 200 * 1024 })).toBeNull()
    expect(checkIconFile({ type: 'image/svg+xml', size: 1000 })).toBeNull()
  })
  it('rejects other types and larger files', () => {
    expect(checkIconFile({ type: 'image/jpeg', size: 1000 })).toBe('type')
    expect(checkIconFile({ type: 'image/png', size: 200 * 1024 + 1 })).toBe('size')
  })
})

describe('checkIconDimensions', () => {
  it('needs a square of at least 128 px for PNG', () => {
    expect(checkIconDimensions(128, 128, false)).toBeNull()
    expect(checkIconDimensions(512, 510, false)).toBeNull()
    expect(checkIconDimensions(127, 127, false)).toBe('tooSmall')
    expect(checkIconDimensions(200, 100, false)).toBe('notSquare')
  })
  it('only checks the shape of an SVG', () => {
    expect(checkIconDimensions(24, 24, true)).toBeNull()
    expect(checkIconDimensions(24, 12, true)).toBe('notSquare')
  })
})

describe('removePlainBackground', () => {
  const white = [255, 255, 255, 255]
  const black = [0, 0, 0, 255]

  it('clears a plain background and keeps the shape', () => {
    const data = image(10, 10, white, { color: black, from: 3, to: 7 })
    expect(removePlainBackground(data, 10, 10)).toBe('removed')
    expect(alphaAt(data, 10, 0, 0)).toBe(0)
    expect(alphaAt(data, 10, 5, 5)).toBe(255)
  })

  it('keeps background-coloured pixels enclosed by the shape', () => {
    // A black ring with a white centre: the centre isn't reachable from the border.
    const data = image(10, 10, white, { color: black, from: 2, to: 8 })
    for (let y = 4; y < 6; y++) for (let x = 4; x < 6; x++) data.set(white, (y * 10 + x) * 4)
    removePlainBackground(data, 10, 10)
    expect(alphaAt(data, 10, 4, 4)).toBe(255)
  })

  it('leaves an already transparent image alone', () => {
    const data = image(4, 4, [0, 0, 0, 0], { color: black, from: 1, to: 3 })
    expect(removePlainBackground(data, 4, 4)).toBe('alreadyTransparent')
    expect(alphaAt(data, 4, 1, 1)).toBe(255)
  })

  it('reports no plain background when the corners disagree', () => {
    const data = image(4, 4, white)
    data.set(black, 0)
    expect(removePlainBackground(data, 4, 4)).toBe('noPlainBackground')
  })

  it('reports no plain background for a single flat colour', () => {
    const data = image(4, 4, white)
    expect(removePlainBackground(data, 4, 4)).toBe('noPlainBackground')
  })
})

describe('toSilhouette / opaqueShare', () => {
  it('blackens colour but keeps transparency', () => {
    const data = new Uint8ClampedArray([200, 100, 50, 255, 10, 20, 30, 0])
    toSilhouette(data)
    expect([...data]).toEqual([0, 0, 0, 255, 0, 0, 0, 0])
    expect(opaqueShare(data)).toBe(0.5)
  })
})
