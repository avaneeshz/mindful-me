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
 *
 * The clock is pinned, as it is everywhere in this suite.
 */
const AT_4PM = new Date(2026, 7, 25, 16, 0) // slot 32

function run(...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, createInitialState({}, AT_4PM))
}

/** Like `run`, but continues from an existing state rather than a fresh one. */
function applyFrom(state: BoardState, ...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, state)
}

function renderEditor(state: BoardState): string {
  return renderToStaticMarkup(<SlotEditor state={state} dispatch={() => {}} nowSlot={32} />)
}

/** Slot 20 is 10:00–10:30 — deliberately NOT the initially selected slot (32). */
const DROP: BoardAction = { type: 'dropCard', cardName: 'Errand time', slot: 20 }

describe('dropping an activity onto a slot', () => {
  const html = renderEditor(run(DROP))

  it('opens the configuration panel on the dropped slot', () => {
    expect(html).toContain(formatSlotRange(20))
    expect(html).toContain('Selected slot')
    // Not the slot that was selected before the drop.
    expect(html).not.toContain(formatSlotRange(32))
  })

  it('pre-populates the panel with the dropped activity', () => {
    expect(html).toContain('Errand time')
    // The drilled-in view of the picker, i.e. the card really is selected —
    // the 24-tile grid is replaced by its breadcrumb.
    expect(html).toContain('Activity selection')
    expect(html).not.toContain('Night Sleep')
  })

  it('offers the standard duration through the existing stepper, uncommitted', () => {
    expect(html).toContain('30 min')
    expect(html).toContain('aria-label="Increase duration by 15 minutes"')
    expect(html).toContain('aria-label="Decrease duration by 15 minutes"')
  })

  it('waits for an explicit confirmation rather than auto-committing', () => {
    expect(html).toContain('Add to slot')
    // Nothing is listed as placed in the slot yet.
    expect(run(DROP).entries[20]).toBeUndefined()
  })

  it('offers a cancel that discards the pending drop', () => {
    expect(html).toContain('Cancel')

    const cancelled = run(DROP, { type: 'cancelStaging' })
    expect(renderEditor(cancelled)).not.toContain('Add to slot')
    expect(cancelled.entries[20]).toBeUndefined()
  })

  it('lists the activity in the slot once it is confirmed', () => {
    const committed = run(DROP, { type: 'commit' })
    const confirmed = renderEditor(committed)

    expect(committed.entries[20].activities).toEqual([
      { name: 'Errand time', path: [], duration: 30 },
    ])
    expect(confirmed).toContain('Errand time')
    // Staging is cleared, so the confirm action is gone again.
    expect(confirmed).not.toContain('Add to slot')
  })
})

/* ---------------------------------------------------------------------------
 * Follow-up to Bug C: a 45-minute activity anchored at slot 20 covers all of
 * 20 (10:00-10:30) and the first 15 minutes of slot 21 (10:30-11:00). The
 * capacity meter used to sum the activity's raw duration, so opening slot 20
 * read "45/30 min used" — the whole activity attributed to one 30-minute
 * cell — while slot 21, which genuinely carries 15 of those minutes, read
 * "0/30" (looked untouched). Both should reflect the slot-clipped/spillover
 * split that `isSlotFullAt` already enforces for capacity purposes.
 * ------------------------------------------------------------------------- */
describe('opening a slot that is part of a longer, spilling activity', () => {
  const withSpillingActivity = run(
    { type: 'selectSlot', slot: 20 },
    { type: 'pickCard', cardName: 'Homework' },
    { type: 'stepDuration', delta: 15 }, // 30 -> 45
    { type: 'commit' },
  )

  it("shows only the anchor slot's own clipped capacity, not the activity's full duration", () => {
    const html = renderEditor(withSpillingActivity)
    expect(html).toContain('30/30 min used')
    expect(html).not.toContain('45/30 min used')
  })

  it('attributes the spilled-into minutes to the next slot, leaving the true remainder open', () => {
    const nextSlot = boardReducer(withSpillingActivity, { type: 'selectSlot', slot: 21 })
    // Bug C: a slot with genuine leftover capacity selects on its own terms.
    expect(nextSlot.selectedSlot).toBe(21)

    const html = renderEditor(nextSlot)
    expect(html).toContain('15/30 min used')
    // 15 minutes are genuinely free, so the picker must not read as full.
    expect(html).not.toContain('This slot is full')
  })

  it("still edits the activity's real total duration from its anchor slot, not the clipped display", () => {
    const editing = boardReducer(withSpillingActivity, { type: 'editActivity', index: 0 })
    const html = renderEditor(editing)
    // The duration stepper (the actual edit control) must show the real 45
    // minutes — the capacity meter's 30-minute attribution is a display
    // clamp only and must never leak into what the user edits.
    expect(html).toContain('45 min')
  })
})

/* ---------------------------------------------------------------------------
 * Follow-up: the "IN THIS SLOT" row still showed the RAW activity duration
 * (e.g. 60 min) at the anchor slot, and showed nothing at all for a slot
 * fully consumed by spillover — because that slot was unreachable outright
 * (see the `boardReducer` redirect-removal tests). Exact repro from the
 * report: a 60-minute "Homework" anchored at 10:00 spans 10:00–11:00.
 * ------------------------------------------------------------------------- */
describe('the "in this slot" list attributes a spanning activity per slot', () => {
  const withSixtyMinuteActivity = run(
    { type: 'selectSlot', slot: 20 },
    { type: 'pickCard', cardName: 'Homework' },
    { type: 'stepDuration', delta: 30 }, // 30 -> 60, spans slot 20 and 21
    { type: 'commit' },
  )

  it('shows the anchor slot’s own 30-minute share, not the raw 60-minute total', () => {
    const html = renderEditor(withSixtyMinuteActivity)
    expect(html).toContain('In this slot')
    expect(html).toContain('Homework')
    // The ACTIVITY ROW's duration label specifically — not `.toContain('60
    // min')`, which would also false-match the (legitimate, unrelated) "This
    // slot is full — 1 activity totalling 60 minutes" picker copy below it,
    // which intentionally still states the real total (see StagingPane note).
    expect(html).toMatch(/>30 min</)
    expect(html).not.toMatch(/>60 min</)
  })

  it('opens the fully spillover-consumed next slot directly and shows its own 30-minute share', () => {
    const nextSlot = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    // Not redirected to the anchor — every cell opens on its own terms now.
    expect(nextSlot.selectedSlot).toBe(21)

    const html = renderEditor(nextSlot)
    expect(html).toContain(formatSlotRange(21))
    expect(html).toContain('In this slot')
    expect(html).toContain('Homework')
    expect(html).toMatch(/>30 min</)
    expect(html).not.toMatch(/>60 min</)
    // Says where the real activity lives, since Edit/Remove here jump there.
    expect(html).toContain('continues from')
  })

  it('makes Edit and Remove reachable from the spilled-into slot, targeting the real activity', () => {
    const nextSlot = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    const html = renderEditor(nextSlot)
    // Edit is in place (see the "editing in place" describe block below) —
    // its label says the activity continues from its anchor, not that
    // clicking it will take you there.
    expect(html).toMatch(/aria-label="Edit Homework, continuing from its [^"]*10:00[^"]* slot"/)
    // Remove still jumps to the anchor (see SlotEditor.tsx for why), so its
    // label keeps saying so.
    expect(html).toMatch(/aria-label="Remove Homework, anchored in its [^"]*10:00[^"]* slot"/)
  })

  it('generalizes to a 3-slot span: every spanned slot shows its own 30-minute share', () => {
    const spanning = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 60 }, // 30 -> 90, spans 20, 21, 22
      { type: 'commit' },
    )
    for (const slot of [21, 22]) {
      const selected = boardReducer(spanning, { type: 'selectSlot', slot })
      expect(selected.selectedSlot).toBe(slot)
      const html = renderEditor(selected)
      expect(html).toMatch(/>30 min</)
      expect(html).not.toMatch(/>90 min</)
      expect(html).toContain('continues from')
    }
  })

  it('does not regress the partial-spillover case: genuine leftover minutes stay selectable for a different activity', () => {
    const partial = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 15 }, // 30 -> 45, spans 20 and 21 (15 min into 21)
      { type: 'commit' },
    )
    const nextSlot = boardReducer(partial, { type: 'selectSlot', slot: 21 })
    expect(nextSlot.selectedSlot).toBe(21)

    const html = renderEditor(nextSlot)
    // The spillover row shows its own 15-minute share…
    expect(html).toMatch(/>15 min</)
    // …and the slot is not "full": 15 genuine minutes remain pickable.
    expect(html).not.toContain('This slot is full')
  })
})

/* ---------------------------------------------------------------------------
 * Follow-up: clicking "Edit" on a spillover row used to jump `selectedSlot`
 * to the activity's anchor before the user could do anything — reported as
 * "I can't edit this slot", even though the underlying duration change
 * would have worked. Editing now loads the real activity into the SAME
 * stepper without moving `selectedSlot` — the user stays on the slot they
 * clicked Edit from, and a duration change that shrinks the activity below
 * that slot frees it up right there, no navigation required. (Remove still
 * jumps to the anchor — see SlotEditor.tsx for why — so it is out of scope
 * here.)
 * ------------------------------------------------------------------------- */
describe('editing a spillover row in place', () => {
  const withSixtyMinuteActivity = run(
    { type: 'selectSlot', slot: 20 },
    { type: 'pickCard', cardName: 'Homework' },
    { type: 'stepDuration', delta: 30 }, // 30 -> 60, spans slot 20 and 21
    { type: 'commit' },
  )

  it('loads the real activity for editing WITHOUT moving selectedSlot away from the spillover slot', () => {
    const viewing21 = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    // This is exactly what clicking "Edit" on the spillover row dispatches —
    // see SlotEditor.tsx's `onEditSpillover`.
    const editing = boardReducer(viewing21, {
      type: 'editActivity',
      index: 0,
      slot: 20,
    })

    // Still looking at 21 — no jump.
    expect(editing.selectedSlot).toBe(21)
    expect(editing.staging).toMatchObject({
      cardName: 'Homework',
      editingIndex: 0,
      editingSlot: 20,
      duration: 60, // the real total, not the 30-minute slot-clipped share
    })

    const html = renderEditor(editing)
    expect(html).toContain(formatSlotRange(21))
    // The stepper shows the real duration, and the spillover row itself
    // picks up the "Editing" state.
    expect(html).toContain('1h')
    expect(html).toContain('Editing')
  })

  it('shrinking the duration from the spillover slot frees its own capacity immediately, in place', () => {
    const viewing21 = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    const shrunk = applyFrom(
      viewing21,
      { type: 'editActivity', index: 0, slot: 20 },
      { type: 'stepDuration', delta: -15 }, // 60 -> 45
      { type: 'commit' },
    )

    // Never left slot 21.
    expect(shrunk.selectedSlot).toBe(21)
    // The real record shrank, at its real anchor.
    expect(shrunk.entries[20].activities).toEqual([
      { name: 'Homework', path: [], duration: 45 },
    ])
    // Staging is cleared — the edit is done, not still open.
    expect(shrunk.staging.cardName).toBeNull()

    const html = renderEditor(shrunk)
    // 21 now shows only its own genuine 15-minute spillover share…
    expect(html).toMatch(/>15 min</)
    // …with 15 minutes still free for something else, right here.
    expect(html).not.toContain('This slot is full')
  })

  it('shrinking all the way to nothing left in this slot clears its spillover row and opens the picker', () => {
    const viewing21 = boardReducer(withSixtyMinuteActivity, { type: 'selectSlot', slot: 21 })
    const shrunk = applyFrom(
      viewing21,
      { type: 'editActivity', index: 0, slot: 20 },
      { type: 'stepDuration', delta: -45 }, // 60 -> 15, no longer reaches 21 at all
      { type: 'commit' },
    )

    expect(shrunk.selectedSlot).toBe(21)
    expect(shrunk.entries[20].activities).toEqual([
      { name: 'Homework', path: [], duration: 15 },
    ])
    expect(shrunk.entries[21]).toBeUndefined()

    const html = renderEditor(shrunk)
    // The "In this slot" section disappears entirely — nothing (native or
    // spillover) occupies 21 any more. ("Homework" itself still legitimately
    // appears as one of the 24 picker tiles below, so that is not the check.)
    expect(html).not.toContain('In this slot')
    expect(html).not.toContain('This slot is full')
  })

  it('growing the duration from the spillover slot still works and stays in place', () => {
    const partial = run(
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 15 }, // 30 -> 45, 15 min spills into 21
      { type: 'commit' },
    )
    const viewing21 = boardReducer(partial, { type: 'selectSlot', slot: 21 })
    const grown = applyFrom(
      viewing21,
      { type: 'editActivity', index: 0, slot: 20 },
      { type: 'stepDuration', delta: 15 }, // 45 -> 60, now fully covers 21
      { type: 'commit' },
    )

    expect(grown.selectedSlot).toBe(21)
    expect(grown.entries[20].activities).toEqual([{ name: 'Homework', path: [], duration: 60 }])
    const html = renderEditor(grown)
    expect(html).toMatch(/>30 min</)
    expect(html).toContain('This slot is full')
  })
})
