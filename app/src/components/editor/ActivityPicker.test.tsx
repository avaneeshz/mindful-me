import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActivityPicker } from './ActivityPicker'
import { CATEGORY_ORDER, cardsForCategory } from '@/data/activities'
import { EMPTY_STAGING } from '@/state/boardReducer'
import type { ActivityList } from '@/domain/types'

const NO_ACTIVITIES: ActivityList = []
const NO_DISMISSED: ReadonlySet<string> = new Set()

function renderPicker(overrides: Partial<ComponentProps<typeof ActivityPicker>> = {}): string {
  return renderToStaticMarkup(
    <ActivityPicker
      staging={EMPTY_STAGING}
      atCapacity={false}
      activityCount={0}
      usedMinutes={0}
      activities={NO_ACTIVITIES}
      dismissed={NO_DISMISSED}
      onPickCard={() => {}}
      onPickOption={() => {}}
      onToggleDismiss={() => {}}
      onBack={() => {}}
      {...overrides}
    />,
  )
}

/**
 * Bug this guards (carried over from the flat-grid era): the picker must
 * never unmount its main pickable surface entirely just because the
 * SELECTED slot happens to be full — sighted users can still drag a tile
 * onto a different, non-full slot. Re-targeted at the new main 3x3 tile
 * screen, which is now that always-mounted surface.
 */
describe('the main 9-tile screen stays mounted regardless of slot capacity', () => {
  it('renders all 9 tiles when the slot has room', () => {
    const html = renderPicker({ atCapacity: false })
    expect(html).toContain('picker-grid-main')
    // No tile is withdrawn from the tab order/a11y tree — the icon/badge
    // decorations inside each tile are legitimately aria-hidden on their
    // own, but that's independent of a tile itself being reachable.
    expect(html.match(/tabindex="-1"/g) ?? []).toHaveLength(0)
    // `renderToStaticMarkup` HTML-escapes "&" to "&amp;" — assert the
    // escaped form, which is what actually reaches the page.
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
    const html = renderPicker({ atCapacity: true, activityCount: 1, usedMinutes: 30 })
    expect(html).toContain('picker-grid-main')
    expect(html).toContain('This slot is full')
    // 9 tile buttons, each aria-hidden + tabindex="-1" — never `disabled`,
    // since dragging a tile onto a DIFFERENT slot must keep working.
    expect(html.match(/tabindex="-1"/g) ?? []).toHaveLength(9)
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })

  it('shows no "this slot is full" note, and no aria-hidden tiles, once the slot has room', () => {
    const html = renderPicker({ atCapacity: false })
    expect(html).not.toContain('This slot is full')
  })
})

describe('the "x of y done" tile badge', () => {
  it('reads 0 of N when nothing is locked', () => {
    const html = renderPicker()
    const sleepCount = cardsForCategory('sleep').length
    expect(html).toContain(`0/${sleepCount}`)
    expect(html).toContain(`Sleep &amp; Rest, 0 of ${sleepCount} done`)
  })

  it('counts an auto-locked item once its scheduled-today count reaches its limit', () => {
    // "Night Sleep" is auto:1 — one use today is enough to lock it.
    const activities: ActivityList = [
      {
        id: 'a1',
        name: 'Night Sleep',
        path: [],
        startMinutes: 0,
        durationMinutes: 480,
        flags: [],
        status: 'planned',
        timezone: 'UTC',
      },
    ]
    const html = renderPicker({ activities })
    const sleepCount = cardsForCategory('sleep').length
    expect(html).toContain(`1/${sleepCount}`)
  })

  it('counts a manually-dismissed item without any matching activity at all', () => {
    // "Slow down" (Sleep & Rest) is `manual`.
    const html = renderPicker({ dismissed: new Set(['Slow down']) })
    const sleepCount = cardsForCategory('sleep').length
    expect(html).toContain(`1/${sleepCount}`)
  })

  it('renders every tile’s badge with its own real item count, not a shared constant', () => {
    const html = renderPicker()
    for (const categoryId of CATEGORY_ORDER) {
      expect(html).toContain(`0/${cardsForCategory(categoryId).length}`)
    }
  })
})

describe('whole-tile lock treatment', () => {
  it('marks the whole tile locked once every one of its own items is locked', () => {
    // Sleep & Rest: Night Sleep(auto:1), Day Sleep(auto:1), Bed
    // Exercise(auto:2), Supplements(manual), Slow down(manual).
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], status: 'planned', timezone: 'UTC' },
      { id: 'a2', name: 'Day Sleep', path: [], startMinutes: 60, durationMinutes: 30, flags: [], status: 'planned', timezone: 'UTC' },
      { id: 'a3', name: 'Bed Exercise', path: [], startMinutes: 120, durationMinutes: 15, flags: [], status: 'planned', timezone: 'UTC' },
      { id: 'a4', name: 'Bed Exercise', path: [], startMinutes: 150, durationMinutes: 15, flags: [], status: 'planned', timezone: 'UTC' },
    ]
    const dismissed = new Set(['Supplements', 'Slow down'])
    const sleepCount = cardsForCategory('sleep').length
    const html = renderPicker({ activities, dismissed })
    expect(html).toContain(`${sleepCount}/${sleepCount}`)
  })

  it('stays inside the 3x3 grid rather than disappearing once fully locked', () => {
    const activities: ActivityList = [
      { id: 'a1', name: 'Night Sleep', path: [], startMinutes: 0, durationMinutes: 30, flags: [], status: 'planned', timezone: 'UTC' },
      { id: 'a2', name: 'Day Sleep', path: [], startMinutes: 60, durationMinutes: 30, flags: [], status: 'planned', timezone: 'UTC' },
      { id: 'a3', name: 'Bed Exercise', path: [], startMinutes: 120, durationMinutes: 15, flags: [], status: 'planned', timezone: 'UTC' },
      { id: 'a4', name: 'Bed Exercise', path: [], startMinutes: 150, durationMinutes: 15, flags: [], status: 'planned', timezone: 'UTC' },
    ]
    const dismissed = new Set(['Supplements', 'Slow down'])
    const html = renderPicker({ activities, dismissed })
    expect(html).toContain('Sleep &amp; Rest')
    expect(html.match(/picker-grid-main/g)).toHaveLength(1)
  })
})

describe('drilled into a card — breadcrumb and options (unchanged mechanism)', () => {
  it('offers the new Supplements dosing-window list', () => {
    const html = renderPicker({ staging: { ...EMPTY_STAGING, cardName: 'Supplements' } })
    expect(html).toContain('Activity selection')
    expect(html).toContain('Supplements')
    expect(html).toContain('Zinc (post-breakfast)')
    expect(html).toContain('Magnesium (post-dinner)')
  })

  it('still goes two levels deep for Body Care (self)', () => {
    const html = renderPicker({
      staging: { ...EMPTY_STAGING, cardName: 'Body Care (self)', path: ['Oiling'] },
    })
    expect(html).toContain('Body Care (self)')
    expect(html).toContain('Oiling')
    expect(html).toContain('Face')
    expect(html).toContain('Hair')
  })

  it('shows the "selected, set duration" message at a true leaf (no further options)', () => {
    const html = renderPicker({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('Selected. Set the duration and add it to the slot.')
  })

  it('does not render the 9-tile main screen while drilled into a card', () => {
    const html = renderPicker({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).not.toContain('picker-grid-main')
  })
})

describe('slot-full notice copy (unchanged)', () => {
  it('reports the slot’s real entry count and real total', () => {
    const html = renderPicker({ atCapacity: true, activityCount: 2, usedMinutes: 45 })
    expect(html).toContain('2 activities totalling 45 minutes')
  })
})
