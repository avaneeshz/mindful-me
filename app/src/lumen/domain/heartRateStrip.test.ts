import { describe, expect, it } from 'vitest'
import { heartRateOnAxis, heartRateScale, heartRateSummary, stripSeries, waveformPath, type HeartSample } from './heartRateStrip'

/** A stored day row starting at local midnight of `y-m-d` in the browser's zone. */
function localRow(y: number, m: number, d: number, points: Array<[number, number]>) {
  const start = new Date(y, m - 1, d)
  const next = new Date(y, m - 1, d + 1)
  return { recordedAt: start.toISOString(), endAt: next.toISOString(), value: { points, min: 40, max: 160, avg: 70, count: points.length } }
}
const S = (minute: number, bpm: number): HeartSample => ({ minute, bpm })

describe('heartRateOnAxis', () => {
  it('averages readings into 5-minute buckets', () => {
    const row = localRow(2026, 5, 10, [[360, 60], [361, 62], [364, 64], [365, 70]])
    expect(heartRateOnAxis([row], '2026-05-10')).toEqual([S(360, 62), S(365, 70)])
  })

  it('drops readings outside 06:00 -> 06:00', () => {
    const row = localRow(2026, 5, 10, [[359, 60], [360, 61], [1439, 62]])
    expect(heartRateOnAxis([row], '2026-05-10').map((s) => s.minute)).toEqual([360, 1435])
  })

  it('night spans two calendar rows', () => {
    const a = localRow(2026, 5, 10, [[1200, 55], [1439, 50]])
    const b = localRow(2026, 5, 11, [[0, 51], [359, 58], [360, 90]])
    const out = heartRateOnAxis([b, a], '2026-05-10')
    expect(out.map((s) => s.minute)).toEqual([1200, 1435, 1440, 1795])
    expect(out[3].bpm).toBe(58)
  })

  it('places a row by absolute instant when it starts the previous UTC day (India)', () => {
    // 2026-05-10 00:00 IST = 2026-05-09T18:30Z. Reading at minute 420 is 07:00 IST that day.
    const row = { recordedAt: '2026-05-09T18:30:00.000Z', endAt: '2026-05-10T18:30:00.000Z', value: { points: [[420, 70]], min: 70, max: 70, avg: 70, count: 1 } }
    const at = new Date(Date.parse(row.recordedAt) + 420 * 60_000)
    const expected = (Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) - Date.UTC(2026, 4, 10)) / 60_000 + at.getHours() * 60 + at.getMinutes()
    const out = heartRateOnAxis([row], '2026-05-10')
    if (expected >= 360 && expected < 1800) expect(out).toEqual([S(Math.floor(expected / 5) * 5, 70)])
    else expect(out).toEqual([])
  })

  it('returns nothing, without throwing, for empty or malformed input', () => {
    expect(heartRateOnAxis([], '2026-05-10')).toEqual([])
    expect(heartRateOnAxis(null, '2026-05-10')).toEqual([])
    expect(heartRateOnAxis([{ recordedAt: 'nope', value: {} }, { recordedAt: '2026-05-10T00:00:00Z', value: 'x' }, { recordedAt: '2026-05-10T00:00:00Z', value: { points: [['a', 1]], min: 1, max: 1, avg: 1 } }], '2026-05-10')).toEqual([])
    expect(heartRateOnAxis([localRow(2026, 5, 10, [[400, 60]])], 'garbage')).toEqual([])
  })
})

describe('stripSeries', () => {
  const all = [S(355, 60), S(360, 61), S(365, 62), S(1075, 63), S(1080, 64), S(1085, 65), S(1100, 66)]
  it('keeps only the strip range', () => {
    expect(stripSeries(all, 'day').flat().map((s) => s.minute)).toEqual([360, 365, 1075])
    expect(stripSeries(all, 'night').flat().map((s) => s.minute)).toEqual([1080, 1085, 1100])
  })
  it('splits wherever buckets are more than 10 minutes apart', () => {
    expect(stripSeries([S(360, 1), S(370, 1), S(385, 1), S(390, 1)], 'day')).toEqual([[S(360, 1), S(370, 1)], [S(385, 1), S(390, 1)]])
  })
  it('is empty with no data', () => expect(stripSeries([], 'day')).toEqual([]))
})

describe('heartRateScale / summary', () => {
  it('pads the whole-day range', () => {
    expect(heartRateScale([S(400, 60), S(1500, 120)])).toEqual({ min: 57, max: 123 })
  })
  it('widens a flat range symmetrically to 10 bpm', () => {
    expect(heartRateScale([S(400, 60), S(410, 62)])).toEqual({ min: 56, max: 66 })
  })
  it('summarises whole bpm or null', () => {
    expect(heartRateSummary([S(400, 58.4), S(410, 111.6)])).toEqual({ min: 58, max: 112 })
    expect(heartRateSummary([])).toBeNull()
  })
})

describe('waveformPath', () => {
  const o = { rangeStart: 360, span: 720, width: 720, height: 40, padY: 7, min: 50, max: 100 }
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

  it('draws higher bpm higher and maps x by time', () => {
    const d = waveformPath([S(360, 50), S(720, 100)], o)
    expect(d.startsWith('M 0 33')).toBe(true) // min -> height - padY
    expect(d.endsWith('360 7')).toBe(true) // max -> padY, x = half
  })
  it('never overshoots the padding', () => {
    const seg = [S(360, 50), S(365, 100), S(370, 50), S(375, 100), S(380, 99), S(385, 100), S(390, 50)]
    const d = waveformPath(seg, o)
    const n = nums(d).slice(0)
    const ys = n.filter((_, i) => i % 2 === 1)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(7 - 1e-6)
    expect(Math.max(...ys)).toBeLessThanOrEqual(33 + 1e-6)
  })
  it('turns a single point into a short flat tick and empty into ""', () => {
    expect(waveformPath([S(400, 75)], o)).toBe('M 38.5 20 L 41.5 20')
    expect(waveformPath([], o)).toBe('')
    expect(waveformPath([S(400, 75)], { ...o, width: 0 })).toBe('')
  })
})
