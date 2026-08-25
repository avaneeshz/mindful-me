import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CapacityMeter } from './CapacityMeter'
import type { PlacedActivity } from '@/domain/types'

const activity = (name: string, duration: number): PlacedActivity => ({
  name,
  path: [],
  duration,
})

function fillCount(html: string): number {
  return (html.match(/class="absolute inset-y-0 rounded-full/g) ?? []).length
}

/**
 * Follow-up to Bug C: the meter used to sum `activities` raw duration, with
 * no notion of spillover. That meant:
 *  - the ANCHOR slot of an activity longer than 30 minutes (e.g. 45) read as
 *    "45/30 min used" — the full duration "attributed" to one 30-minute cell.
 *  - the slot it spills INTO read as "0/30 min used" (looked completely
 *    empty), even though it genuinely carries part of that duration.
 *
 * `spillover` is presentation-only and is provably consistent with the real
 * enforcement in `domain/slots` (`remainingMinutesAt`): for every reachable
 * board state, `SLOT_MINUTES - remainingMinutesAt(entries, slot)` equals
 * `min(SLOT_MINUTES, spillover + sum(activities.duration))`, which is what
 * this component computes as `used`.
 */
describe('CapacityMeter', () => {
  it('behaves exactly as before when there is no spillover (regression safety)', () => {
    const html = renderToStaticMarkup(
      <CapacityMeter activities={[activity('Homework', 15), activity('Errand time', 15)]} />,
    )
    expect(html).toContain('30/30 min used')
    expect(fillCount(html)).toBe(2)
  })

  it("clips the anchor slot's own overflowing activity to this slot's 30 minutes", () => {
    const html = renderToStaticMarkup(<CapacityMeter activities={[activity('Homework', 45)]} />)
    expect(html).toContain('30/30 min used')
    expect(html).not.toContain('45/30 min used')
    expect(fillCount(html)).toBe(1)
  })

  it('attributes spillover-only minutes to a slot with no committed activities of its own', () => {
    const html = renderToStaticMarkup(<CapacityMeter activities={[]} spillover={15} />)
    expect(html).toContain('15/30 min used')
    expect(fillCount(html)).toBe(1)
  })

  it('treats a slot fully consumed by spillover as genuinely full', () => {
    const html = renderToStaticMarkup(<CapacityMeter activities={[]} spillover={30} />)
    expect(html).toContain('30/30 min used')
    expect(html).toContain('bg-terracotta')
  })

  it('combines spillover with the slot’s own activity when both are present', () => {
    const html = renderToStaticMarkup(
      <CapacityMeter activities={[activity('Errand time', 15)]} spillover={15} />,
    )
    expect(html).toContain('30/30 min used')
    expect(fillCount(html)).toBe(2)
  })
})
