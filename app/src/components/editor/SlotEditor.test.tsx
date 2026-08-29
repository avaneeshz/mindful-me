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
    <SlotEditor state={state} dispatch={() => {}} nowSlot={32} viewedDate={AT_4PM} />,
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

  it('pre-populates the panel with the dropped activity', () => {
    expect(html).toContain('Errand time')
    expect(html).toContain('Activity selection')
    expect(html).not.toContain('Night Sleep')
  })

  it('offers the standard duration through the existing stepper, uncommitted', () => {
    expect(html).toContain('30 min')
  })

  it('waits for an explicit confirmation rather than auto-committing', () => {
    expect(html).toContain('Add to slot')
    expect(run(DROP).activities).toEqual([])
  })

  it('offers a cancel that discards the pending drop', () => {
    expect(html).toContain('Cancel')
    const cancelled = run(DROP, { type: 'cancelStaging' })
    expect(renderEditor(cancelled)).not.toContain('Add to slot')
    expect(cancelled.activities).toEqual([])
  })

  it('lists the activity in the slot once it is confirmed', () => {
    const committed = run(DROP, { type: 'commit' })
    const confirmed = renderEditor(committed)
    expect(committed.activities).toMatchObject([{ name: 'Errand time', startMinutes: 600, durationMinutes: 30 }])
    expect(confirmed).toContain('Errand time')
    expect(confirmed).not.toContain('Add to slot')
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
