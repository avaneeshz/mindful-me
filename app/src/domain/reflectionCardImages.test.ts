import { describe, expect, it } from 'vitest'
import { CARD_IMAGE, checkCardImageFile, clampCrop, INITIAL_CROP, sourceRect } from './reflectionCardImages'

describe('reflectionCardImages', () => {
  it('rejects wrong types and oversized files', () => {
    expect(checkCardImageFile({ type: 'image/gif', size: 10 })).toBe('type')
    expect(checkCardImageFile({ type: 'image/png', size: CARD_IMAGE.maxFileBytes + 1 })).toBe('size')
    expect(checkCardImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })
  it('always crops to the frame ratio', () => {
    for (const [w, h] of [[2000, 1000], [1000, 2000], [800, 600]]) {
      const r = sourceRect(w, h, { zoom: 1.7, panX: 0.4, panY: -0.3 })
      expect(r.w / r.h).toBeCloseTo(CARD_IMAGE.ratio, 5)
    }
  })
  it('stays inside the picture at the extremes', () => {
    for (const pan of [-5, -1, 0, 1, 5]) {
      const r = sourceRect(2000, 1000, { zoom: 2, panX: pan, panY: pan })
      expect(r.x).toBeGreaterThanOrEqual(-1e-6)
      expect(r.y).toBeGreaterThanOrEqual(-1e-6)
      expect(r.x + r.w).toBeLessThanOrEqual(2000 + 1e-6)
      expect(r.y + r.h).toBeLessThanOrEqual(1000 + 1e-6)
    }
  })
  it('zoom 1 on an already-4:3 picture uses all of it', () => {
    expect(sourceRect(800, 600, INITIAL_CROP)).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })
  it('clamps the view', () => {
    expect(clampCrop({ zoom: 9, panX: 3, panY: -3 })).toEqual({ zoom: CARD_IMAGE.maxZoom, panX: 1, panY: -1 })
  })
})
