import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActivityPicker } from './ActivityPicker'
import { ACTIVITY_CARDS } from '@/data/activities'
import { EMPTY_STAGING } from '@/state/boardReducer'

/**
 * Bug: the picker unmounted `.picker-grid` entirely whenever `atCapacity` was
 * true for the SELECTED slot. A 30-minute slot reaches capacity after one
 * default-duration activity, so placing a single activity removed every
 * draggable card from the screen — the user had no way to drag a card onto a
 * DIFFERENT, empty slot until they first selected a non-full slot manually.
 *
 * The grid must stay mounted and every tile draggable regardless of the
 * selected slot's capacity; only the manual click-to-add messaging (and the
 * tiles' presence in the accessibility tree, which mirrors it) is scoped to
 * the selected slot being full.
 */
function renderPicker(atCapacity: boolean): string {
  return renderToStaticMarkup(
    <ActivityPicker
      staging={EMPTY_STAGING}
      atCapacity={atCapacity}
      activityCount={atCapacity ? 1 : 0}
      usedMinutes={atCapacity ? 30 : 0}
      onPickCard={() => {}}
      onPickOption={() => {}}
      onBack={() => {}}
    />
  )
}

describe('ActivityPicker stays a drag source when the selected slot is full', () => {
  it('keeps every activity tile mounted and draggable when the selected slot is at capacity', () => {
    const html = renderPicker(true)
    expect(html).toContain('picker-grid')
    expect(html.match(/draggable="true"/g) ?? []).toHaveLength(ACTIVITY_CARDS.length)
  })

  it('still shows the "this slot is full" note as a secondary message, not a replacement', () => {
    const html = renderPicker(true)
    expect(html).toContain('This slot is full')
    // The grid and the message coexist in the markup.
    expect(html).toContain('picker-grid')
  })

  it('renders the same draggable tiles, with no full-slot note, when the slot has room', () => {
    const html = renderPicker(false)
    expect(html.match(/draggable="true"/g) ?? []).toHaveLength(ACTIVITY_CARDS.length)
    expect(html).not.toContain('This slot is full')
  })

  it('withdraws the tiles from the tab order / a11y tree when full, without disabling them', () => {
    const full = renderPicker(true)
    const open = renderPicker(false)
    // `disabled` would also block dragging (see ActivityTile), so the full
    // state must use aria-hidden + tabindex="-1" instead, never `disabled`.
    expect(full.match(/tabindex="-1"/g) ?? []).toHaveLength(ACTIVITY_CARDS.length)
    expect(full.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(
      ACTIVITY_CARDS.length,
    )
    expect(open.match(/tabindex="-1"/g) ?? []).toHaveLength(0)
  })
})
