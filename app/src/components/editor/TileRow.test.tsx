import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TileRow } from './TileRow'
import { CATEGORY_ORDER, cardsForCategory } from '@/data/activities'
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

describe('the "x of y done" tile badge', () => {
  it('reads 0/N when nothing is locked', () => {
    const html = renderRow()
    const sleepCount = cardsForCategory('sleep').length
    expect(html).toContain(`0/${sleepCount}`)
    expect(html).toContain(`Sleep &amp; Rest, 0 of ${sleepCount} done`)
  })

  it('counts an auto-locked item once its scheduled-today count reaches its limit', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 480, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
    ]
    const html = renderRow({ activities })
    expect(html).toContain(`1/${cardsForCategory('sleep').length}`)
  })

  it('counts a manually-dismissed item without any matching activity at all', () => {
    const html = renderRow({ dismissed: new Set(['Slow down']) })
    expect(html).toContain(`1/${cardsForCategory('sleep').length}`)
  })

  it('renders every tile’s badge with its own real item count', () => {
    const html = renderRow()
    for (const categoryId of CATEGORY_ORDER) {
      expect(html).toContain(`0/${cardsForCategory(categoryId).length}`)
    }
  })
})

describe('whole-tile lock treatment', () => {
  it('marks the whole tile locked once every one of its own items is locked', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
      { id: 'a2', name: 'Day Sleep', path: [], startMinutes: 60, durationMinutes: 30, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
      { id: 'a3', name: 'Bed Exercise', path: [], startMinutes: 120, durationMinutes: 15, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
      { id: 'a4', name: 'Bed Exercise', path: [], startMinutes: 150, durationMinutes: 15, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
    ]
    const dismissed = new Set(['Supplements', 'Slow down'])
    const sleepCount = cardsForCategory('sleep').length
    const html = renderRow({ activities, dismissed })
    expect(html).toContain(`${sleepCount}/${sleepCount}`)
  })

  it('stays inside the row rather than disappearing once fully locked', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
      { id: 'a2', name: 'Day Sleep', path: [], startMinutes: 60, durationMinutes: 30, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
      { id: 'a3', name: 'Bed Exercise', path: [], startMinutes: 120, durationMinutes: 15, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
      { id: 'a4', name: 'Bed Exercise', path: [], startMinutes: 150, durationMinutes: 15, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
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

describe('one shared accent, fill-width row (approved mockup)', () => {
  it('uses the single shared tile-accent token for every tile, not 9 different category colours', () => {
    const html = renderRow()
    // The colour itself lives in exactly one place (the `tile-accent` theme
    // token, backed by `--tile-accent` in index.css) — components reach it
    // through ordinary utility classes, never a repeated literal. None of
    // the old per-category `--cat-*-deep` tokens are read here any more.
    expect(html).toContain('text-tile-accent')
    expect(html).not.toContain('--cat-sleep-deep')
    expect(html).not.toContain('#2F6FE0')
  })

  it('tiles are flex-1/min-w-0 (fill the row edge-to-edge), not a fixed width', () => {
    const html = renderRow()
    expect(html).not.toContain('w-[104px]')
    expect(html).toContain('flex-1')
    expect(html).toContain('min-w-0')
  })

  it('the fill height is a real done/total percentage, not a fixed decorative one', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], quality: null, status: 'planned', timezone: 'UTC' },
    ]
    const html = renderRow({ activities }) // Sleep & Rest: 1 of 5 -> 20%
    expect(html).toContain('height:20%')
  })

  it('an empty tile (0 done) renders no fill container at all', () => {
    const html = renderRow()
    expect(html).not.toContain('height:0%')
  })

  it('a fully-done tile fills to 100% and drops the old dimming treatment', () => {
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
        quality: null,
        status: 'planned' as const,
        timezone: 'UTC',
      }))
    const dismissed = new Set(cards.filter((c) => c.disappear.mode === 'manual').map((c) => c.name))
    const html = renderRow({ activities, dismissed })
    const growthCount = cards.length
    expect(html).toContain(`${growthCount}/${growthCount}`)
    expect(html).toContain('height:100%')
    expect(html).not.toContain('saturate')
    expect(html).not.toContain('opacity-80')
  })
})
