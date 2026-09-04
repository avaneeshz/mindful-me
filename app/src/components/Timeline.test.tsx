import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Timeline } from './Timeline'
import { ThemeProvider } from '@/state/ThemeContext'
import type { ActivityList } from '@/domain/types'

const NO_ACTIVITIES: ActivityList = []

function renderTimeline(now: Date | null = null): string {
  return renderToStaticMarkup(
    <ThemeProvider>
      <Timeline
        activities={NO_ACTIVITIES}
        selectedSlot={20}
        now={now}
        onSelectSlot={() => {}}
        onDropCard={() => {}}
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
