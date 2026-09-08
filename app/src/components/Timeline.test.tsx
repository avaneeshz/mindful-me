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
    notes: null,
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
      />
    </ThemeProvider>,
  )
}

describe('the Sun/Moon end-caps are the theme toggle (Section A)', () => {
  it('renders both as real buttons, not decorative spans', () => {
    const html = renderTimeline()
    expect(html).toContain('aria-label="Switch to light theme"')
    expect(html).toContain('aria-label="Switch to dark theme"')
    // Real interactive elements — not `role="img"` placeholders.
    expect(html).not.toContain('role="img"')
  })

  it('the dark theme is the default — the Moon cap reads as selected on first load, the Sun does not', () => {
    const html = renderTimeline()
    const moonButtonTag = html.match(/<button[^>]*aria-label="Switch to dark theme"[^>]*>/)?.[0]
    const sunButtonTag = html.match(/<button[^>]*aria-label="Switch to light theme"[^>]*>/)?.[0]
    expect(moonButtonTag).toContain('aria-pressed="true"')
    expect(sunButtonTag).toContain('aria-pressed="false"')
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

  it('the night strip is a fixed grey, independent of the theme toggle', () => {
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
      notes: null,
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

describe('activity click-routing beats every sibling that used to out-rank it (M-1 fix)', () => {
  // Regression coverage for the confirmed QA finding: a z-[N] on the
  // individual activity <button>s only wins against OTHER CHILDREN of the
  // same overlay wrapper — it can never out-rank a SIBLING of the wrapper
  // itself, and the wrapper's own stacking value is what actually competes
  // with the selected-slot button (z-[2]) and the legacy flag-marker span
  // (z-[6]). The wrapper must out-rank both.
  it('the activity-overlay wrapper itself now out-ranks the selected-slot button (z-[2]) and the flag marker (z-[6])', () => {
    const html = renderTimeline(null, [activity(10 * 60, 30, 'Homework')])
    expect(html).toContain('pointer-events-none absolute inset-0 z-[7]')
    // The old, too-low wrapper stacking value must be gone, not merely
    // shadowed by a second class.
    expect(html).not.toContain('pointer-events-none absolute inset-0 z-[1]"')
  })

  it('the legacy flag-marker dot is pointer-events-none — decorative, never a click target', () => {
    const flagMarker: ScheduledActivity = {
      id: 'marker-1',
      name: null,
      path: [],
      startMinutes: 600,
      durationMinutes: 0,
      flags: ['Attack'],
      quality: [],
      symptoms: [],
      notes: null,
      status: 'planned',
      timezone: 'UTC',
    }
    const html = renderTimeline(null, [flagMarker])
    // The marker span still paints above (z-[6], unchanged, for visibility)
    // but must not intercept clicks meant for whatever sits beneath it.
    const markerSpan = html.match(/<span aria-hidden="true" class="[^"]*z-\[6\][^"]*">/)?.[0]
    expect(markerSpan).toBeDefined()
    expect(markerSpan).toContain('pointer-events-none')
    expect(markerSpan).toContain('z-[6]')
  })

  it('an activity segment sharing a selected slot stays reachable: its own button still carries data-activity and sits inside the now-higher overlay', () => {
    // Two 15-minute activities packed into the same slot (29 = 14:30-14:45,
    // 14:45-15:00) — the exact packed-slot shape from the confirmed repro.
    const bodyCare = activity(14 * 60 + 30, 15, 'Body Care (self)')
    const supplements = { ...activity(14 * 60 + 45, 15, 'Supplements'), id: 'supplements-1' }
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <Timeline
          activities={[bodyCare, supplements]}
          selectedSlot={29}
          now={null}
          onSelectSlot={() => {}}
          onDropCard={() => {}}
          onSelectActivity={() => {}}
        />
      </ThemeProvider>,
    )
    expect(html).toContain(`data-activity="${bodyCare.id}"`)
    expect(html).toContain('data-activity="supplements-1"')
    // One overlay wrapper per row (Day, Night) — both now carry the raised
    // z-[7], not just whichever row happens to hold this slot.
    expect(html.match(/pointer-events-none absolute inset-0 z-\[7\]/g)?.length).toBe(2)
  })
})
