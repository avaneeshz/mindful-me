import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TileRow } from './TileRow'
import { CATEGORIES, CATEGORY_ORDER, cardsForCategory } from '@/data/activities'
import type { ActivityList } from '@/domain/types'

const NO_ACTIVITIES: ActivityList = []
const NO_DISMISSED: ReadonlySet<string> = new Set()

function renderRow(overrides: Partial<ComponentProps<typeof TileRow>> = {}): string {
  return renderToStaticMarkup(
    <TileRow
      atCapacity={false}
      activityCount={0}
      usedMinutes={0}
      activities={NO_ACTIVITIES}
      dismissed={NO_DISMISSED}
      onPickCard={() => {}}
      onToggleDismiss={() => {}}
      {...overrides}
    />,
  )
}

describe('the 9-tile row stays mounted regardless of slot capacity', () => {
  it('renders all 9 tiles when the slot has room', () => {
    const html = renderRow({ atCapacity: false })
    expect(html).toContain('tile-row')
    expect(html.match(/tabindex="-1"/g) ?? []).toHaveLength(0)
    // `renderToStaticMarkup` HTML-escapes "&" to "&amp;".
    for (const label of [
      'Sleep &amp; Rest',
      'Food &amp; Nourishment',
      'Personal Care',
      'Downtime &amp; Errands',
      'Movement &amp; Body Therapy',
      'Work &amp; Projects',
      'Nature &amp; Spirit',
      'Growth &amp; Connection',
      'Home &amp; Chores',
    ]) {
      expect(html).toContain(label)
    }
  })

  it('keeps all 9 tiles mounted, dimmed and withdrawn from the a11y tree, when the slot is full', () => {
    const html = renderRow({ atCapacity: true, activityCount: 1, usedMinutes: 30 })
    expect(html).toContain('tile-row')
    expect(html).toContain('This slot is full')
    expect(html.match(/tabindex="-1"/g) ?? []).toHaveLength(9)
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })

  it('shows no "this slot is full" note once the slot has room', () => {
    expect(renderRow({ atCapacity: false })).not.toContain('This slot is full')
  })
})

describe('tile progress — spoken via aria-label, no visible "x/y" badge any more', () => {
  // Section B replaced the old visible "x/y" numeric badge with a flat
  // progress bar (fill width = done/total) — the exact count is still
  // announced to assistive tech through each tile's own aria-label, just no
  // longer duplicated as visible text on the tile.
  it('reads "0 of N done" when nothing is locked', () => {
    const html = renderRow()
    const sleepCount = cardsForCategory('sleep').length
    expect(html).toContain(`Sleep &amp; Rest, 0 of ${sleepCount} done`)
  })

  it('counts an auto-locked item once its scheduled-today count reaches its limit', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 480, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ]
    const html = renderRow({ activities })
    expect(html).toContain(`Sleep &amp; Rest, 1 of ${cardsForCategory('sleep').length} done`)
  })

  it('counts a manually-dismissed item without any matching activity at all', () => {
    const html = renderRow({ dismissed: new Set(['Slow down']) })
    expect(html).toContain(`Sleep &amp; Rest, 1 of ${cardsForCategory('sleep').length} done`)
  })

  it('reports every tile’s own real item count', () => {
    const html = renderRow()
    for (const categoryId of CATEGORY_ORDER) {
      const label = CATEGORIES[categoryId].label.replace('&', '&amp;')
      const count = cardsForCategory(categoryId).length
      expect(html).toContain(`${label}, 0 of ${count} done`)
    }
  })
})

describe('whole-tile lock treatment', () => {
  it('marks the whole tile locked once every one of its own items is locked', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
      { id: 'a2', name: 'Day Sleep', path: [], startMinutes: 60, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
      { id: 'a3', name: 'Bed Exercise', path: [], startMinutes: 120, durationMinutes: 15, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
      { id: 'a4', name: 'Bed Exercise', path: [], startMinutes: 150, durationMinutes: 15, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ]
    const dismissed = new Set(['Supplements', 'Slow down'])
    const sleepCount = cardsForCategory('sleep').length
    const html = renderRow({ activities, dismissed })
    expect(html).toContain(`Sleep &amp; Rest, ${sleepCount} of ${sleepCount} done`)
    expect(html).toContain('width:100%')
  })

  it('stays inside the row rather than disappearing once fully locked', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
      { id: 'a2', name: 'Day Sleep', path: [], startMinutes: 60, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
      { id: 'a3', name: 'Bed Exercise', path: [], startMinutes: 120, durationMinutes: 15, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
      { id: 'a4', name: 'Bed Exercise', path: [], startMinutes: 150, durationMinutes: 15, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ]
    const dismissed = new Set(['Supplements', 'Slow down'])
    const html = renderRow({ activities, dismissed })
    expect(html).toContain('Sleep &amp; Rest')
    expect(html.match(/class="tile-row/g)).toHaveLength(1)
  })
})

describe('slot-full notice copy', () => {
  it('reports the slot’s real entry count and real total', () => {
    const html = renderRow({ atCapacity: true, activityCount: 2, usedMinutes: 45 })
    expect(html).toContain('2 activities totalling 45 minutes')
  })
})

describe('monochrome, flat-progress-bar tile row (Section A/B — no colour anywhere)', () => {
  it('uses no colour anywhere — no per-category or tile-accent tokens, only ink/surface/line', () => {
    const html = renderRow()
    // The old shared-accent blue and every per-category token are both
    // gone — tiles are plain ink-on-surface now, same as everything else
    // in the monochrome theme.
    expect(html).not.toContain('tile-accent')
    expect(html).not.toContain('--cat-sleep-deep')
    expect(html).not.toContain('#2F6FE0')
    expect(html).not.toContain('#2f6fe0')
    expect(html).toContain('text-ink')
  })

  it('tiles are flex-1/min-w-0 (fill the row edge-to-edge), not a fixed width', () => {
    const html = renderRow()
    expect(html).not.toContain('w-[104px]')
    expect(html).toContain('flex-1')
    expect(html).toContain('min-w-0')
  })

  it('renders no separate numeric "x/y" badge on the tile — done/total is now spoken only, via aria-label', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ]
    const html = renderRow({ activities })
    // "1/5" (the old visible badge format) does not appear anywhere in the
    // tile markup; the aria-label still carries the real count in words.
    expect(html).not.toContain('>1/5<')
    expect(html).toContain('Sleep &amp; Rest, 1 of 5 done')
  })

  it('the progress bar fill is a real done/total WIDTH percentage (Section B — replaces the old water-fill HEIGHT gauge)', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ]
    const html = renderRow({ activities }) // Sleep & Rest: 1 of 5 -> 20%
    expect(html).toContain('width:20%')
    expect(html).not.toMatch(/height:\d+%/)
  })

  it('an empty tile (0 done) still renders the bar track, at 0% fill', () => {
    const html = renderRow()
    expect(html).toContain('width:0%')
  })

  it('a fully-done tile fills to 100% and carries no separate dimming treatment', () => {
    const cards = cardsForCategory('growth')
    const activities: ActivityList = cards
      .filter((c) => c.disappear.mode === 'auto')
      .map((c, i) => ({
        id: `g${i}`,
        name: c.name,
        path: [],
        startMinutes: i * 30,
        durationMinutes: 15,
        flags: [],
        quality: [], symptoms: [], notes: null,
        status: 'planned' as const,
        timezone: 'UTC',
      }))
    const dismissed = new Set(cards.filter((c) => c.disappear.mode === 'manual').map((c) => c.name))
    const html = renderRow({ activities, dismissed })
    const growthCount = cards.length
    expect(html).toContain(`Growth &amp; Connection, ${growthCount} of ${growthCount} done`)
    expect(html).toContain('width:100%')
    expect(html).not.toContain('saturate')
    expect(html).not.toContain('opacity-80')
  })
})
