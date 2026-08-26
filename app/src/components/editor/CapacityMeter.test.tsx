import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CapacityMeter } from './CapacityMeter'

function fillCount(html: string): number {
  return (html.match(/class="absolute inset-y-0 rounded-full/g) ?? []).length
}

describe('CapacityMeter', () => {
  it('draws one fill per activity, each sized by its own real share of this cell', () => {
    const html = renderToStaticMarkup(
      <CapacityMeter
        segments={[
          { id: 'a', minutes: 15 },
          { id: 'b', minutes: 15 },
        ]}
      />,
    )
    expect(html).toContain('30/30 min used')
    expect(fillCount(html)).toBe(2)
  })

  it("clips a spanning activity's fill to this cell's real share, not its full duration", () => {
    // e.g. a 45-minute activity anchored one cell earlier reaches only 15
    // minutes into this one — the caller is expected to have already clipped
    // via `minutesInSlot`, and this just draws whatever it is handed.
    const html = renderToStaticMarkup(<CapacityMeter segments={[{ id: 'a', minutes: 15 }]} />)
    expect(html).toContain('15/30 min used')
    expect(fillCount(html)).toBe(1)
  })

  it('reports an empty slot as 0/30, with no fills', () => {
    const html = renderToStaticMarkup(<CapacityMeter segments={[]} />)
    expect(html).toContain('0/30 min used')
    expect(fillCount(html)).toBe(0)
  })

  it('turns the fill Terracotta only at a genuine 30/30', () => {
    const partial = renderToStaticMarkup(<CapacityMeter segments={[{ id: 'a', minutes: 15 }]} />)
    expect(partial).not.toContain('bg-terracotta')

    const full = renderToStaticMarkup(<CapacityMeter segments={[{ id: 'a', minutes: 30 }]} />)
    expect(full).toContain('bg-terracotta')
  })

  it('supports more than two activities sharing one cell — there is no 2-activity cap', () => {
    const html = renderToStaticMarkup(
      <CapacityMeter
        segments={[
          { id: 'a', minutes: 10 },
          { id: 'b', minutes: 10 },
          { id: 'c', minutes: 10 },
        ]}
      />,
    )
    expect(html).toContain('30/30 min used')
    expect(fillCount(html)).toBe(3)
  })
})
