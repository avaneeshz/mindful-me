import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const h = vi.hoisted(() => ({ samples: [] as Array<{ minute: number; bpm: number }> }))
vi.mock('@/lumen/data/useHeartRateDay', () => ({
  useHeartRateDay: () => ({ samples: h.samples, scale: { min: 50, max: 120 } }),
}))
vi.mock('@/lumen/lib/store', () => ({
  SLOT_MINUTES: 30,
  useStore: () => ({
    axis: [],
    tileOf: () => undefined,
    selectedSlot: 360,
    setSelectedSlot: () => {},
    nowMinute: null,
    isToday: false,
    day: '2026-05-10',
    today: '2026-05-11',
  }),
}))

import { DayStrips } from './day-strips'

describe('DayStrips heart rate', () => {
  it('adds no line and no extra label without data', () => {
    h.samples = []
    const html = renderToStaticMarkup(<DayStrips />)
    expect(html).not.toContain('heart rate')
    expect(html).not.toContain('<path')
  })
  it('draws a line in the strip that has data and labels its range', () => {
    h.samples = [{ minute: 400, bpm: 58 }, { minute: 405, bpm: 112 }, { minute: 410, bpm: 70 }]
    const html = renderToStaticMarkup(<DayStrips />)
    expect(html).toContain('heart rate 58 to 112 bpm')
    expect(html.match(/heart rate/g)).toHaveLength(1) // the night strip has none
  })
})
