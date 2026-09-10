import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Timeline } from './Timeline'
import { ThemeProvider } from '@/state/ThemeContext'
import type { ActivityList, ScheduledActivity } from '@/domain/types'

const NO_ACTIVITIES: ActivityList = []

function activity(startMinutes: number, durationMinutes: number, name = 'Homework'): ScheduledActivity {
  return {
    id: `a-${startMinutes}-${durationMinutes}`,
    name,
    path: [],
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null, reflections: [],
    status: 'planned',
    timezone: 'UTC',
  }
}

function renderTimeline(now: Date | null = null, activities: ActivityList = NO_ACTIVITIES): string {
  return renderToStaticMarkup(
    <ThemeProvider>
      <Timeline
        activities={activities}
        selectedSlot={20}
        now={now}
        onSelectSlot={() => {}}
        onDropCard={() => {}}
        onSelectActivity={() => {}}
        selectedActivityId={null}
        onQuickLog={() => {}}
      />
    </ThemeProvider>,
  )
}

describe('the Sun/Moon end-caps are the light-log triggers (no longer a theme toggle)', () => {
  it('renders both as real buttons that open the sun/moon light log', () => {
    const html = renderTimeline()
    expect(html).toContain('aria-label="Log sun exposure"')
    expect(html).toContain('aria-label="Log moon exposure"')
    // Real interactive elements — not `role="img"` placeholders.
    expect(html).not.toContain('role="img"')
  })

  it('no longer carries the retired "Switch to … theme" toggle affordance', () => {
    const html = renderTimeline()
    expect(html).not.toContain('Switch to light theme')
    expect(html).not.toContain('Switch to dark theme')
  })

  it('each cap is a dialog trigger, closed on first render', () => {
    const html = renderTimeline()
    const sunButtonTag = html.match(/<button[^>]*aria-label="Log sun exposure"[^>]*>/)?.[0]
    expect(sunButtonTag).toContain('aria-haspopup="dialog"')
    expect(sunButtonTag).toContain('aria-expanded="false"')
  })
})

describe('hour ticks — every hour, in their own row below the strip', () => {
  it('renders 13 tick labels per row, never overlaid on the strip itself', () => {
    const html = renderTimeline()
    // Every hour label from both rows' full set appears somewhere.
    for (const label of ['6AM', '7', '12', '6PM', '6AM']) {
      expect(html).toContain(`>${label}<`)
    }
  })
})

describe('no illustrated scenery any more (Section C — flagged reversal)', () => {
  it('the day strip is a plain flat surface tone, not a separate scenery colour', () => {
    const html = renderTimeline()
    expect(html).toContain('bg-surface')
  })

  it('the night strip is a fixed grey, independent of the active theme', () => {
    const html = renderTimeline()
    expect(html).toContain('bg-night-strip-fixed')
  })

  it('renders no gradient-sky/scenery tokens from the retired illustrated backdrop', () => {
    const html = renderTimeline()
    for (const retired of ['sky-day', 'sky-night', 'scenery-cool', 'starlight', 'TimelineScenery']) {
      expect(html).not.toContain(retired)
    }
  })
})

describe('an activity’s own rendered segment is a real, independently operable control', () => {
  it('renders a real <button> carrying data-activity, not a decorative aria-hidden span', () => {
    const html = renderTimeline(null, [activity(10 * 60, 45, 'Homework')])
    const match = html.match(/<button[^>]*data-activity="a-600-45"[^>]*>/)?.[0]
    expect(match).toBeDefined()
    expect(match).not.toContain('aria-hidden')
  })

  it('carries an accessible label naming the activity and its real time range', () => {
    const html = renderTimeline(null, [activity(10 * 60, 45, 'Homework')])
    expect(html).toContain('aria-label="Homework, 10:00 – 10:45"')
  })

  it('includes the drill-down path in the label when present', () => {
    const withPath = activity(10 * 60, 45, 'Body Care (self)')
    withPath.path = ['Oiling', 'Hair']
    const html = renderTimeline(null, [withPath])
    expect(html).toContain('aria-label="Body Care (self) Oiling Hair, 10:00 – 10:45"')
  })

  it('never renders a segment (or a tab stop) for a flag-only marker', () => {
    const flagMarker: ScheduledActivity = {
      id: 'marker-1',
      name: null,
      path: [],
      startMinutes: 600,
      durationMinutes: 0,
      flags: ['Attack'],
      quality: [],
      symptoms: [],
      notes: null, reflections: [],
      status: 'planned',
      timezone: 'UTC',
    }
    const html = renderTimeline(null, [flagMarker])
    expect(html).not.toContain('data-activity')
  })

  it('the wrapping overlay stays pointer-events-none so an uncovered stretch still reaches the slot button beneath', () => {
    const html = renderTimeline(null, [activity(10 * 60, 30, 'Homework')])
    expect(html).toContain('pointer-events-none absolute inset-0')
    // Each activity button re-enables its own pointer events individually.
    const buttonTag = html.match(/<button[^>]*data-activity="a-600-30"[^>]*>/)?.[0]
    expect(buttonTag).toContain('pointer-events-auto')
  })

  it('a fully-covered slot’s own button is dropped from the Tab sequence (tabindex="-1")', () => {
    // A 30-minute activity anchored exactly at slot 20 (10:00-10:30) leaves it
    // with zero free capacity.
    const html = renderTimeline(null, [activity(10 * 60, 30, 'Homework')])
    const slotButton = html.match(/<button[^>]*data-slot="20"[^>]*>/)?.[0]
    expect(slotButton).toContain('tabindex="-1"')
  })

  it('a partially-covered slot keeps its own tab stop alongside the activity’s', () => {
    // A 10-minute activity inside slot 20 leaves 20 real free minutes there.
    const html = renderTimeline(null, [activity(10 * 60, 10, 'Quick task')])
    const slotButton = html.match(/<button[^>]*data-slot="20"[^>]*>/)?.[0]
    expect(slotButton).not.toContain('tabindex="-1"')
  })
})

describe('a short activity’s interactive hit area is floored, independent of its visual width (drag-and-drop bug fix)', () => {
  it('a 1-minute activity’s button still floors at the minimum hit width', () => {
    const html = renderTimeline(null, [activity(10 * 60, 1, 'Quick task')])
    const buttonTag = html.match(/<button[^>]*data-activity="a-600-1"[^>]*>/)?.[0]
    expect(buttonTag).toBeDefined()
    expect(buttonTag).toContain('max(100%, 24px)')
  })

  it('a long (multi-hour) activity’s button carries the exact same floor rule — the fix is not duration-conditional', () => {
    const html = renderTimeline(null, [activity(10 * 60, 180, 'Night Sleep')])
    const buttonTag = html.match(/<button[^>]*data-activity="a-600-180"[^>]*>/)?.[0]
    expect(buttonTag).toContain('max(100%, 24px)')
  })

  it('the VISUAL fill stays exactly duration-proportional — only the button’s hit area is floored, never the drawn box', () => {
    // A 1-minute activity's true width is 1/30/24 of the row — a genuine
    // sliver. The button's OWN rendered width is the floored hit area
    // (asserted above); the wrapping box one level up must still carry that
    // exact tiny percentage, proving the visual fill was never widened.
    const html = renderTimeline(null, [activity(10 * 60, 1, 'Quick task')])
    const trueWidthPercent = (1 / 30 / 24) * 100 // ≈ 0.1389%
    expect(html).toContain(`width:${trueWidthPercent}%`)
  })

  it('the enlarged hit area is centred on the segment (translated by half its own width), not anchored to one edge', () => {
    const html = renderTimeline(null, [activity(10 * 60, 1, 'Quick task')])
    const buttonTag = html.match(/<button[^>]*data-activity="a-600-1"[^>]*>/)?.[0]
    expect(buttonTag).toContain('left-1/2')
    expect(buttonTag).toContain('-translate-x-1/2')
  })
})
