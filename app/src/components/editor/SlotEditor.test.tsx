import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlotEditor } from './SlotEditor'
import {
  boardReducer,
  createInitialState,
  type BoardAction,
  type BoardState,
} from '@/state/boardReducer'
import { formatSlotRange } from '@/domain/slots'
import { PickerDataProvider } from '@/state/PickerDataContext'

/**
 * The editor is the ONE activity-configuration surface in the product. These
 * render it directly, so that "a drop opens the same panel the manual flow
 * uses, pre-populated" is asserted against the markup a user would actually
 * see — not merely against reducer state.
 */
const AT_4PM = new Date(2026, 7, 25, 16, 0) // slot 32

function run(...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, createInitialState([], AT_4PM))
}

function applyFrom(state: BoardState, ...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, state)
}

function renderEditor(state: BoardState): string {
  return renderToStaticMarkup(
    <SlotEditor
      state={state}
      dispatch={() => {}}
      nowSlot={32}
      viewedDate={AT_4PM}
      onOpenReflectionNote={() => {}}
      syncQueue={[]}
      editMode={false}
    />,
  )
}

function realId(state: BoardState, index = 0): string {
  return state.activities.filter((a) => a.name !== null)[index].id
}

/** Slot 20 is 10:00–10:30 — deliberately NOT the initially selected slot (32). */
const DROP: BoardAction = { type: 'dropCard', cardName: 'Errand time', slot: 20 }

describe('dropping an activity onto a slot', () => {
  const html = renderEditor(run(DROP))

  it('opens the configuration panel on the dropped slot', () => {
    expect(html).toContain(formatSlotRange(20))
    expect(html).toContain('Selected slot')
    expect(html).not.toContain(formatSlotRange(32))
  })

  it('pre-populates the modal with the dropped activity', () => {
    expect(html).toContain('Errand time')
    expect(html).toContain('role="dialog"')
    expect(html).not.toContain('Night Sleep')
  })

  it('offers the standard duration through the existing stepper, uncommitted', () => {
    expect(html).toContain('30 min')
  })

  it('waits for an explicit confirmation rather than auto-committing', () => {
    expect(html).toContain('Save entry')
    expect(run(DROP).activities).toEqual([])
  })

  it('offers a cancel that discards the pending drop', () => {
    // No visible "Cancel" button any more — the X close icon is the only
    // way to dismiss without saving, and it dispatches the same
    // `cancelStaging` action a Cancel button used to.
    expect(html).toContain('aria-label="Close"')
    const cancelled = run(DROP, { type: 'cancelStaging' })
    expect(renderEditor(cancelled)).not.toContain('Save entry')
    expect(cancelled.activities).toEqual([])
  })

  it('lists the activity in the slot once it is confirmed', () => {
    const committed = run(DROP, { type: 'commit' })
    const confirmed = renderEditor(committed)
    expect(committed.activities).toMatchObject([{ name: 'Errand time', startMinutes: 600, durationMinutes: 30 }])
    expect(confirmed).toContain('Errand time')
    expect(confirmed).not.toContain('Save entry')
  })
})

describe('opening a slot that is part of a longer, spanning activity', () => {
  const withSpanningActivity = run(
    { type: 'selectSlot', slot: 20 },
    { type: 'pickCard', cardName: 'Homework' },
    { type: 'stepDuration', delta: 15 }, // 30 -> 45, spans slots 20 and 21
    { type: 'commit' },
  )

  it("shows only the selected cell's own clipped share, not the activity's full duration", () => {
    const html = renderEditor(withSpanningActivity)
    expect(html).toContain('30/30 min used')
    expect(html).not.toContain('45/30 min used')
  })

  it('attributes the genuinely free remainder to the next cell, which is not "full"', () => {
    const nextSlot = boardReducer(withSpanningActivity, { type: 'selectSlot', slot: 21 })
    expect(nextSlot.selectedSlot).toBe(21)

    const html = renderEditor(nextSlot)
    expect(html).toContain('15/30 min used')
    expect(html).not.toContain('This slot is full')
  })

  it("still edits the activity's real total duration, not the clipped display", () => {
    const id = realId(withSpanningActivity)
    const editing = boardReducer(withSpanningActivity, { type: 'editActivity', id })
    const html = renderEditor(editing)
    expect(html).toContain('45 min')
  })
})

describe('the "in this slot" list attributes a spanning activity per cell', () => {
  const withSixtyMinuteActivity = run(
    { type: 'selectSlot', slot: 20 },
    { type: 'pickCard', cardName: 'Homework' },
    { type: 'stepDuration', delta: 30 }, // 30 -> 60, spans slot 20 and 21
    { type: 'commit' },
  )

  it('shows the anchor cell’s own 30-minute share, not the raw 60-minute total', () => {
    const html = renderEditor(withSixtyMinuteActivity)
    expect(html).toContain('In this slot')
    expect(html).toContain('Homework')
    expect(html).toMatch(/>30 min</)
    expect(html).not.toMatch(/>60 min</)
  })

  it('opens the fully-covered next cell directly and shows its own 30-minute share', () => {
    const nextSlot = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    expect(nextSlot.selectedSlot).toBe(21)

    const html = renderEditor(nextSlot)
    expect(html).toContain(formatSlotRange(21))
    expect(html).toContain('In this slot')
    expect(html).toContain('Homework')
    expect(html).toMatch(/>30 min</)
    expect(html).not.toMatch(/>60 min</)
    expect(html).toContain('continues from')
  })

  it('makes Edit and Remove reachable from the spanned-into cell, targeting the one real activity', () => {
    const nextSlot = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    const html = renderEditor(nextSlot)
    expect(html).toMatch(/aria-label="Edit Homework, continuing from its [^"]*10:00[^"]* slot"/)
    expect(html).toMatch(/aria-label="Remove Homework, anchored in its [^"]*10:00[^"]* slot"/)
  })

  it('generalizes to a 3-cell span: every spanned cell shows its own 30-minute share', () => {
    const spanning = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 60 }, // 30 -> 90, spans 20, 21, 22
      { type: 'commit' },
    )
    for (const slot of [21, 22]) {
      const selected = boardReducer(spanning, { type: 'selectSlot', slot })
      const html = renderEditor(selected)
      expect(html).toMatch(/>30 min</)
      expect(html).not.toMatch(/>90 min</)
      expect(html).toContain('continues from')
    }
  })
})

describe('Phase 3 — marking an activity complete', () => {
  it('renders an accessible checkbox that reflects planned status by default', () => {
    const state = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
    )
    const html = renderEditor(state)
    expect(html).toContain('role="checkbox"')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('aria-label="Mark Homework completed"')
    expect(html).not.toContain('Completed')
  })

  it('shows the Completed badge and a checked checkbox once toggled', () => {
    let state = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
    )
    const id = realId(state)
    state = boardReducer(state, { type: 'toggleComplete', id })

    const html = renderEditor(state)
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-label="Mark Homework not completed"')
    expect(html).toContain('Completed')
  })

  it('rule 4 — editing a completed activity’s time keeps it completed', () => {
    let state = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
    )
    const id = realId(state)
    state = boardReducer(state, { type: 'toggleComplete', id })
    state = applyFrom(
      state,
      { type: 'editActivity', id },
      { type: 'stepDuration', delta: 5 },
      { type: 'commit' },
    )
    expect(state.activities.find((a) => a.id === id)).toMatchObject({ status: 'completed', durationMinutes: 35 })
    expect(renderEditor(state)).toContain('Completed')
  })
})

describe('activity mode — a selected activity replaces the whole slot body', () => {
  const withSelected = (() => {
    const committed = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'toggleStagingQuality', quality: 'Flow' },
      { type: 'commit' },
    )
    return boardReducer(committed, { type: 'selectScheduledActivity', id: realId(committed) })
  })()
  const html = renderEditor(withSelected)

  it('shows the activity summary — the three signal groups and its quality value, not the slot heading or tile row', () => {
    expect(html).toContain('Homework')
    expect(html).toContain('Activity Quality')
    expect(html).toContain('Chronic Symptoms')
    expect(html).toContain('Protective Response')
    expect(html).toContain('Flow')
    expect(html).not.toContain('Selected slot')
    expect(html).not.toContain('In this slot')
  })

  it('carries Edit and Remove actions directly on the summary', () => {
    expect(html).toContain('aria-label="Edit Homework"')
    expect(html).toContain('aria-label="Remove Homework"')
  })

  it('offers a close affordance back to slot mode', () => {
    expect(html).toContain('aria-label="Close activity summary"')
  })

  it('shows a dash for a signal group with nothing recorded', () => {
    // Homework here has quality Flow but no symptoms and no protective response.
    expect(html).toMatch(/Chronic Symptoms<\/p><\/div><p[^>]*>—</)
  })

  it('reflects a mapped reflection card as a tappable thumbnail, with its note hidden until tapped', () => {
    const withCard = boardReducer(withSelected, {
      type: 'mapReflectionCard',
      scheduledActivityId: realId(withSelected),
      card: 1,
      note: 'Grounded.',
    })
    const cardHtml = renderEditor(withCard)
    expect(cardHtml).toContain('>Reflection<')
    expect(cardHtml).toContain('Somatic')
    expect(cardHtml).toContain('aria-label="Somatic — edit reflection note"')
    // The note text itself only appears in the popup, never inline here.
    expect(cardHtml).not.toContain('Grounded.')
  })
})

describe('editing a spanning activity in place from a later cell', () => {
  const withSixtyMinuteActivity = run(
    { type: 'selectSlot', slot: 20 },
    { type: 'pickCard', cardName: 'Homework' },
    { type: 'stepDuration', delta: 30 }, // 30 -> 60, spans slot 20 and 21
    { type: 'commit' },
  )

  it('loads the real activity for editing WITHOUT moving selectedSlot away from the spanned-into cell', () => {
    const viewing21 = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    const id = realId(withSixtyMinuteActivity)
    const editing = boardReducer(viewing21, { type: 'editActivity', id })

    expect(editing.selectedSlot).toBe(21) // no jump
    expect(editing.staging).toMatchObject({ cardName: 'Homework', editingId: id, durationMinutes: 60 })

    const html = renderEditor(editing)
    expect(html).toContain(formatSlotRange(21))
    expect(html).toContain('1h')
    expect(html).toContain('Editing')
  })

  it('shrinking the duration in place frees the cell’s own capacity immediately', () => {
    const viewing21 = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    const id = realId(withSixtyMinuteActivity)
    const shrunk = applyFrom(
      viewing21,
      { type: 'editActivity', id },
      { type: 'stepDuration', delta: -15 }, // 60 -> 45
      { type: 'commit' },
    )

    expect(shrunk.selectedSlot).toBe(21)
    expect(shrunk.activities.find((a) => a.id === id)).toMatchObject({ durationMinutes: 45 })
    expect(shrunk.staging.cardName).toBeNull()

    const html = renderEditor(shrunk)
    expect(html).toMatch(/>15 min</)
    expect(html).not.toContain('This slot is full')
  })

  it('shrinking all the way past this cell clears its "in this slot" section entirely', () => {
    const viewing21 = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    const id = realId(withSixtyMinuteActivity)
    const shrunk = applyFrom(
      viewing21,
      { type: 'editActivity', id },
      { type: 'stepDuration', delta: -45 }, // 60 -> 15, no longer reaches slot 21 at all
      { type: 'commit' },
    )

    expect(shrunk.selectedSlot).toBe(21)
    expect(shrunk.activities.find((a) => a.id === id)).toMatchObject({ durationMinutes: 15 })

    const html = renderEditor(shrunk)
    expect(html).not.toContain('In this slot')
    expect(html).not.toContain('This slot is full')
  })

  it('growing the duration in place still works and stays put', () => {
    const partial = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 15 }, // 30 -> 45
      { type: 'commit' },
    )
    const id = realId(partial)
    const viewing21 = boardReducer(partial, { type: 'selectSlot', slot: 21 })
    const grown = applyFrom(
      viewing21,
      { type: 'editActivity', id },
      { type: 'stepDuration', delta: 15 }, // 45 -> 60, now fully covers 21
      { type: 'commit' },
    )

    expect(grown.selectedSlot).toBe(21)
    expect(grown.activities.find((a) => a.id === id)).toMatchObject({ durationMinutes: 60 })
    const html = renderEditor(grown)
    expect(html).toMatch(/>30 min</)
    expect(html).toContain('This slot is full')
  })
})

describe('the unified tile/activity management panel (real user feedback: same Edit button, no second hidden page)', () => {
  // `ActivityLibraryPanel` reads `usePickerData()`, so any render with
  // `editMode: true` needs a real `<PickerDataProvider>` ancestor.
  function renderInProvider(state: BoardState, editMode: boolean): string {
    return renderToStaticMarkup(
      <PickerDataProvider>
        <SlotEditor
          state={state}
          dispatch={() => {}}
          nowSlot={32}
          viewedDate={AT_4PM}
          onOpenReflectionNote={() => {}}
          syncQueue={[]}
          editMode={editMode}
        />
      </PickerDataProvider>,
    )
  }

  const slotModeState = run(DROP)
  const activityModeState = (() => {
    const committed = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
    )
    return boardReducer(committed, { type: 'selectScheduledActivity', id: realId(committed) })
  })()

  it('renders no management panel while edit mode is off, in either slot or activity mode', () => {
    expect(renderInProvider(slotModeState, false)).not.toContain('Manage tiles')
    expect(renderInProvider(activityModeState, false)).not.toContain('Manage tiles')
  })

  it('renders the management panel — reusing TileList/ActivityTree/ParameterOptionsPanel — in slot mode once edit mode is on', () => {
    const html = renderInProvider(slotModeState, true)
    expect(html).toContain('Manage tiles')
    expect(html).toContain('aria-label="Tiles"')
    // No activity is selected in the management panel by default (only a
    // tile auto-selects) — "Parameter options" must NOT appear merely
    // because a tile is open; see `ActivityLibraryPanel`'s own doc comment
    // for the fix this asserts (it used to render unconditionally here).
    expect(html).not.toContain('aria-label="Parameter options"')
    // The ordinary tile row is still there too — managing the hierarchy
    // never blocks quick-logging. Two `.tile-row` grids now exist while edit
    // mode is on: the everyday picker's own row, and the management panel's
    // tile grid (redesigned to look exactly the same — see `TileList`'s own
    // doc comment).
    expect(html.match(/class="tile-row/g)?.length).toBe(2)
  })

  it('keeps the management panel reachable in activity mode too — found in self-review: it used to live inside TileRow, which activity mode replaces entirely with ActivitySummary, silently hiding it', () => {
    const html = renderInProvider(activityModeState, true)
    expect(html).toContain('Manage tiles')
    expect(html).toContain('aria-label="Tiles"')
    // Activity mode's own summary is still what's shown above the panel —
    // the panel supplements it, it doesn't replace it.
    expect(html).toContain('Homework')
    expect(html).toContain('aria-label="Selected activity"')
  })
})

describe('the management panel’s tile grid matches the everyday picker’s own tile look (confirmed prototype fix)', () => {
  function renderPanel(editMode: boolean): string {
    return renderToStaticMarkup(
      <PickerDataProvider>
        <SlotEditor
          state={run(DROP)}
          dispatch={() => {}}
          nowSlot={32}
          viewedDate={AT_4PM}
          onOpenReflectionNote={() => {}}
          syncQueue={[]}
          editMode={editMode}
        />
      </PickerDataProvider>,
    )
  }

  it('gives each tile card a pencil "Open" badge and an × "Delete" badge, never top-level reorder arrows', () => {
    const html = renderPanel(true)
    // "Sleep & Rest" is the first of the static local-only catalog's 9
    // default tiles (`CATEGORY_ORDER`/`CATEGORIES`).
    expect(html).toContain('aria-label="Open Sleep &amp; Rest"')
    expect(html).toContain('aria-label="Delete Sleep &amp; Rest"')
    // Dropped in the approved redesign — a tile's position is no longer
    // adjustable from this grid (activities/sub-activities one level in
    // still reorder via ↑↓ inside `ActivityTree`, untouched).
    expect(html).not.toContain('aria-label="Move Sleep &amp; Rest up"')
    expect(html).not.toContain('aria-label="Move Sleep &amp; Rest down"')
  })

  it('renders the trailing "Add tile" card as a dashed, square, plus-icon card, same shape as a real tile', () => {
    const html = renderPanel(true)
    const addTileButton = html.match(/<button[^>]*aria-label="Add tile"[^>]*>/)?.[0]
    expect(addTileButton).toBeDefined()
    expect(addTileButton).toContain('aspect-square')
    expect(addTileButton).toContain('border-dashed')
  })
})
