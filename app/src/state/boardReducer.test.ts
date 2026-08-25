import { describe, expect, it } from 'vitest'
import {
  boardReducer,
  createInitialState,
  isStagingComplete,
  stagingOptions,
  type BoardAction,
  type BoardState,
} from './boardReducer'
import { MAX_ACTIVITIES_PER_SLOT } from '@/domain/slots'
import type { SlotEntries, SlotEntry } from '@/domain/types'

const AT_4PM = new Date(2026, 7, 25, 16, 0) // slot 32

function start(entries: SlotEntries = {}): BoardState {
  return createInitialState(entries, AT_4PM)
}

function run(state: BoardState, ...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, state)
}

function totalMinutes(entry: SlotEntry): number {
  return entry.activities.reduce((sum, a) => sum + a.duration, 0)
}

/**
 * The start slot retains the legacy two-activity capacity. Long activities
 * intentionally exceed 30 minutes because their duration spans later slots.
 */
function assertCapacityHolds(state: BoardState, context: string): void {
  for (const [slot, entry] of Object.entries(state.entries)) {
    expect(
      entry.activities.length,
      `slot ${slot} activity count after ${context}`,
    ).toBeLessThanOrEqual(MAX_ACTIVITIES_PER_SLOT)
    for (const activity of entry.activities) {
      expect(activity.duration % 15, `slot ${slot} duration after ${context}`).toBe(0)
    }
  }
}

describe('initial state', () => {
  it('selects the slot containing the real current time', () => {
    expect(start().selectedSlot).toBe(32)
    expect(start().focusedPeriod).toBe('day')
    expect(createInitialState({}, new Date(2026, 7, 25, 22, 0)).focusedPeriod).toBe('night')
  })
})

describe('the 2-activity / 30-minute capacity rule', () => {
  it('allows two 15-minute activities in one slot', () => {
    const state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'commit' },
    )
    const entry = state.entries[32]
    expect(entry.activities.map((a) => [a.name, a.duration])).toEqual([
      ['Homework', 15],
      ['Errand time', 15],
    ])
  })

  it('refuses to stage a card once the slot is full', () => {
    const full = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' }, // defaults to the whole 30 minutes
    )
    expect(full.entries[32].activities).toHaveLength(1)

    const afterAttempt = boardReducer(full, { type: 'pickCard', cardName: 'Errand time' })
    expect(afterAttempt.staging.cardName).toBeNull()
    expect(afterAttempt.entries[32].activities).toHaveLength(1)
  })

  it('caps the second activity at the minutes actually left', () => {
    const state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 }, // 15 min
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
    )
    // Staged at the ceiling, not at the requested 30.
    expect(state.staging.duration).toBe(15)

    // Pressing "+" at the ceiling must not increment.
    const bumped = boardReducer(state, { type: 'stepDuration', delta: 15 })
    expect(bumped.staging.duration).toBe(15)
  })

  it('never lets combined durations exceed 30 minutes', () => {
    const state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'commit' },
    )
    const total = state.entries[32].activities.reduce((sum, a) => sum + a.duration, 0)
    expect(total).toBeLessThanOrEqual(30)
    expect(state.entries[32].activities.length).toBeLessThanOrEqual(2)
  })
})

describe('drill-down', () => {
  it('requires a leaf before the activity can be committed', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Supplements' })
    expect(isStagingComplete(state.staging)).toBe(false)
    expect(stagingOptions(state.staging)?.options).toContain('Magnesium')

    state = boardReducer(state, { type: 'pickOption', level: 0, value: 'Magnesium' })
    expect(isStagingComplete(state.staging)).toBe(true)
  })

  it('goes three levels deep for Body care only', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Body care' })
    state = boardReducer(state, { type: 'pickOption', level: 0, value: 'Oiling' })

    // Two levels is not yet a leaf for this card.
    expect(isStagingComplete(state.staging)).toBe(false)
    expect(stagingOptions(state.staging)).toEqual({ options: ['Face', 'Body', 'Hair'], level: 1 })

    state = boardReducer(state, { type: 'pickOption', level: 1, value: 'Hair' })
    expect(isStagingComplete(state.staging)).toBe(true)

    state = boardReducer(state, { type: 'commit' })
    expect(state.entries[32].activities[0].path).toEqual(['Oiling', 'Hair'])
  })

  it('steps back one level at a time, then clears the card', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Body care' },
      { type: 'pickOption', level: 0, value: 'Mask' },
      { type: 'pickOption', level: 1, value: 'Face' },
    )
    state = boardReducer(state, { type: 'crumbBack' })
    expect(state.staging.path).toEqual(['Mask'])
    state = boardReducer(state, { type: 'crumbBack' })
    expect(state.staging.path).toEqual([])
    state = boardReducer(state, { type: 'crumbBack' })
    expect(state.staging.cardName).toBeNull()
  })
})

describe('editing an existing entry', () => {
  it('replaces rather than duplicating', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Supplements' },
      { type: 'pickOption', level: 0, value: 'Omega' },
      { type: 'commit' },
    )
    expect(state.entries[32].activities).toHaveLength(1)

    state = boardReducer(state, { type: 'editActivity', index: 0 })
    expect(state.staging.editingIndex).toBe(0)
    expect(state.staging.path).toEqual(['Omega'])

    state = boardReducer(state, { type: 'pickOption', level: 0, value: 'Zinc' })
    state = boardReducer(state, { type: 'commit' })

    expect(state.entries[32].activities).toHaveLength(1)
    expect(state.entries[32].activities[0].path).toEqual(['Zinc'])
  })

  it('lets an edit reclaim its own minutes', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' }, // 15 min, slot has 15 left
      { type: 'editActivity', index: 0 },
    )
    // Editing may grow back to the full 30 because its own 15 is excluded.
    state = boardReducer(state, { type: 'stepDuration', delta: 15 })
    expect(state.staging.duration).toBe(30)
  })
})

describe('remove and undo', () => {
  it('never lets undo breach the capacity rule', () => {
    // The exact reported repro: fill a slot with 15 + 15, remove one, commit a
    // DIFFERENT activity into the freed minutes, then press Undo inside the 4s
    // window. Undo used to splice the removed activity straight back in, with
    // no capacity check, producing 3 activities / 45 minutes.
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'commit' },
    )
    expect(state.entries[32].activities).toHaveLength(2)

    state = boardReducer(state, { type: 'removeActivity', index: 0 })
    expect(state.removal).not.toBeNull()

    state = run(
      state,
      { type: 'pickCard', cardName: 'Meal Prep' },
      { type: 'commit' },
    )
    // Writing to the slot the pending removal belongs to retires the undo.
    expect(state.removal).toBeNull()

    state = boardReducer(state, { type: 'undoRemoval' })
    expect(state.entries[32].activities).toHaveLength(2)
    expect(totalMinutes(state.entries[32])).toBe(30)
  })

  it('discards a stale restore rather than applying it', () => {
    // Same guard from the other direction: force a live removal record whose
    // slot has since been refilled, and prove undoRemoval itself refuses.
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'commit' },
      { type: 'removeActivity', index: 0 },
    )
    const stale = state.removal!
    state = run(state, { type: 'pickCard', cardName: 'Meal Prep' }, { type: 'commit' })

    const forced = boardReducer({ ...state, removal: stale }, { type: 'undoRemoval' })
    expect(forced.entries[32].activities).toHaveLength(2)
    expect(totalMinutes(forced.entries[32])).toBe(30)
    expect(forced.removal).toBeNull()
  })

  it('retires a pending undo when a confirmed drop refills the same slot', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'commit' },
      { type: 'removeActivity', index: 1 },
    )
    expect(state.removal).not.toBeNull()

    // The drop itself only stages — it writes nothing, so the undo survives it.
    state = boardReducer(state, { type: 'dropCard', cardName: 'Meal Prep', slot: 32 })
    expect(state.removal).not.toBeNull()

    // Confirming is the write, and that is what retires the undo.
    state = boardReducer(state, { type: 'commit' })
    expect(state.removal).toBeNull()

    state = boardReducer(state, { type: 'undoRemoval' })
    expect(state.entries[32].activities).toHaveLength(2)
    expect(totalMinutes(state.entries[32])).toBe(30)
  })

  it('removes independently and restores in place', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'commit' },
    )
    expect(state.entries[32].activities).toHaveLength(2)

    state = boardReducer(state, { type: 'removeActivity', index: 0 })
    expect(state.entries[32].activities.map((a) => a.name)).toEqual(['Errand time'])
    expect(state.removal?.activity.name).toBe('Homework')

    state = boardReducer(state, { type: 'undoRemoval' })
    expect(state.entries[32].activities.map((a) => a.name)).toEqual(['Homework', 'Errand time'])
    expect(state.removal).toBeNull()
  })
})

describe('flags', () => {
  it('toggles independently of activities and never consumes capacity', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' }, // slot is now full on minutes
      { type: 'toggleFlag', flag: 'Stress response' },
      { type: 'toggleFlag', flag: 'Fear response' },
      { type: 'toggleFlag', flag: 'Trauma response' },
    )
    expect(state.entries[32].flags).toHaveLength(3)
    expect(state.entries[32].activities[0].duration).toBe(30)

    state = boardReducer(state, { type: 'toggleFlag', flag: 'Fear response' })
    expect(state.entries[32].flags).toEqual(['Stress response', 'Trauma response'])
  })

  it('can flag an otherwise empty slot', () => {
    const state = boardReducer(start(), { type: 'toggleFlag', flag: 'Fear response' })
    expect(state.entries[32]).toEqual({ activities: [], flags: ['Fear response'] })
  })
})

/* ---------------------------------------------------------------------------
 * Drag and drop is the manual flow, not a second placement path.
 *
 * The old behaviour committed a flat card on drop at an assumed 30 minutes,
 * which skipped the duration stepper, the capacity ceiling and the explicit
 * confirm. These cover the replacement contract: a drop stages, the user
 * configures, and only "Add to slot" writes.
 * ------------------------------------------------------------------------- */
describe('drag and drop', () => {
  const DROP: BoardAction = { type: 'dropCard', cardName: 'Errand time', slot: 20 }

  it('stages a dropped card against the dropped slot instead of committing it', () => {
    const state = boardReducer(start(), DROP)

    expect(state.selectedSlot).toBe(20)
    expect(state.staging.cardName).toBe('Errand time')
    expect(state.staging.editingIndex).toBeNull()
    // The app's standard default, offered — not applied.
    expect(state.staging.duration).toBe(30)
    // Nothing has been written.
    expect(state.entries[20]).toBeUndefined()
  })

  it('is exactly "select the slot, then pick the card"', () => {
    const dropped = boardReducer(start(), DROP)
    const manual = run(
      start(),
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Errand time' },
    )
    expect(dropped).toEqual(manual)
  })

  it('commits the dropped card only on an explicit confirm', () => {
    const state = run(start(), DROP, { type: 'commit' })
    expect(state.entries[20].activities).toEqual([
      { name: 'Errand time', path: [], duration: 30 },
    ])
    expect(state.staging.cardName).toBeNull()
  })

  it('lets the duration be adjusted before the confirm', () => {
    const state = run(
      start(),
      DROP,
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
    )
    expect(state.entries[20].activities).toEqual([
      { name: 'Errand time', path: [], duration: 15 },
    ])
  })

  it('discards the pending drop on cancel', () => {
    const state = run(start(), DROP, { type: 'cancelStaging' })
    expect(state.staging.cardName).toBeNull()
    expect(state.entries[20]).toBeUndefined()
    // Cancelling the drop leaves the dropped slot selected, exactly as
    // cancelling a manually picked card does.
    expect(state.selectedSlot).toBe(20)
  })

  it('opens the sub-picker instead of guessing a sub-option', () => {
    const state = boardReducer(start(), {
      type: 'dropCard',
      cardName: 'Nature connect',
      slot: 20,
    })
    expect(state.entries[20]).toBeUndefined()
    expect(state.staging.cardName).toBe('Nature connect')
    expect(state.staging.path).toEqual([])
    expect(isStagingComplete(state.staging)).toBe(false)
  })

  it('opens a full slot for editing rather than failing silently', () => {
    const full = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
    )
    const dropped = boardReducer(full, {
      type: 'dropCard',
      cardName: 'Errand time',
      slot: 32,
    })
    expect(dropped.selectedSlot).toBe(32)
    expect(dropped.staging.cardName).toBeNull()
    expect(dropped.entries[32].activities).toHaveLength(1)
  })

  it('reuses the manual flow’s conflict handling when the duration is grown', () => {
    // Slot 22 is occupied. A card dropped on slot 20 may grow to fill 20 and
    // 21 and must stop dead at 22 rather than overwriting or truncating it.
    const occupied = start({
      22: { activities: [{ name: 'Meal Prep', path: [], duration: 30 }], flags: [] },
    })
    const state = run(occupied, DROP, { type: 'stepDuration', delta: 300 })

    expect(state.staging.duration).toBe(60)

    const committed = boardReducer(state, { type: 'commit' })
    expect(committed.entries[20].activities).toEqual([
      { name: 'Errand time', path: [], duration: 60 },
    ])
    expect(committed.entries[22].activities).toEqual([
      { name: 'Meal Prep', path: [], duration: 30 },
    ])
  })

  it('resolves a drop onto a covered cell to that literal cell, not the covering activity’s anchor', () => {
    // Identical to clicking the same cell: slot 21 is covered by the
    // 60-minute activity anchored at 20, but every cell is independently
    // selectable/editable now, so the editor opens on slot 21 itself. It
    // stages nothing — slot 21 has no capacity left, net of the spillover.
    const covered = start({
      20: { activities: [{ name: 'Meal Prep', path: [], duration: 60 }], flags: [] },
    })
    const state = boardReducer(covered, {
      type: 'dropCard',
      cardName: 'Errand time',
      slot: 21,
    })
    expect(state.selectedSlot).toBe(21)
    expect(state.staging.cardName).toBeNull()
    expect(state.entries[21]).toBeUndefined()
  })
})

describe('variable activity duration', () => {
  it('stores a four-hour activity as one anchored record', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 14 * 15 },
      { type: 'commit' },
    )
    expect(state.entries[32].activities).toEqual([
      { name: 'Homework', path: [], duration: 240 },
    ])
  })

  it('caps a range immediately before an occupied later slot', () => {
    const state = run(
      start({ 36: { activities: [{ name: 'Meal Prep', path: [], duration: 30 }], flags: [] } }),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 200 },
    )
    expect(state.staging.duration).toBe(120)
  })
})

/* ---------------------------------------------------------------------------
 * The capacity rule as a PROPERTY, not a set of examples.
 *
 * The undo bug survived a suite that already tested capacity, because it only
 * appeared in a specific INTERLEAVING (remove -> commit into the same slot ->
 * undo) that no single example covered. This drives long pseudo-random action
 * sequences and asserts the invariant after every single step, so a future
 * action that forgets the rule fails here regardless of how it is reached.
 * ------------------------------------------------------------------------- */
describe('capacity holds under arbitrary action sequences', () => {
  const CARDS = ['Homework', 'Errand time', 'Meal Prep', 'Vipassana', 'Night Sleep']
  const SLOTS = [30, 31, 32]

  /** Deterministic PRNG (mulberry32) — a failure is always reproducible. */
  function rng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function randomAction(next: () => number): BoardAction {
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]
    switch (Math.floor(next() * 9)) {
      case 0:
        return { type: 'selectSlot', slot: pick(SLOTS) }
      case 1:
        return { type: 'pickCard', cardName: pick(CARDS) }
      case 2:
        return { type: 'stepDuration', delta: pick([15, -15]) }
      case 3:
      case 4:
        return { type: 'commit' }
      case 5:
        return { type: 'removeActivity', index: pick([0, 1]) }
      case 6:
        return { type: 'undoRemoval' }
      case 7:
        return { type: 'editActivity', index: pick([0, 1]) }
      default:
        return { type: 'dropCard', cardName: pick(CARDS), slot: pick(SLOTS) }
    }
  }

  it('never exceeds 2 activities or 30 minutes in any slot', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = rng(seed)
      let state = start()
      for (let step = 0; step < 120; step += 1) {
        const action = randomAction(next)
        state = boardReducer(state, action)
        assertCapacityHolds(state, `seed ${seed} step ${step} (${action.type})`)
      }
    }
  })
})

/* ---------------------------------------------------------------------------
 * Bug: clicking (or dropping on) a slot covered by an earlier anchor's longer
 * activity always redirected selection to that anchor — for a PARTIALLY
 * covered slot this blocked its own genuine leftover minutes from ever being
 * reached; for a FULLY covered slot it made that slot un-openable outright.
 * Every 30-minute cell is now independently selectable/editable, whatever its
 * spillover state, with its own share of the covering activity reachable via
 * `SlotActivityList`'s spillover row (Edit/Remove there act on the one real
 * record at its anchor — see the "Edit/Remove a spillover row" tests below).
 * ------------------------------------------------------------------------- */
describe('a slot partially covered by spillover from an earlier, longer activity', () => {
  it('selects on its own terms and accepts an activity into its genuine leftover minutes', () => {
    // A 45-minute activity anchored at 10 covers all of 10 and the first 15
    // minutes of 11, leaving 11 with 15 free minutes of its own.
    let state = run(
      start(),
      { type: 'selectSlot', slot: 10 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 15 }, // 30 -> 45
      { type: 'commit' },
    )
    expect(state.entries[10].activities).toEqual([{ name: 'Homework', path: [], duration: 45 }])

    state = boardReducer(state, { type: 'selectSlot', slot: 11 })
    // Not redirected back to the anchor — slot 11 has its own leftover room.
    expect(state.selectedSlot).toBe(11)

    state = run(state, { type: 'pickCard', cardName: 'Errand time' }, { type: 'commit' })
    expect(state.entries[11].activities).toEqual([
      { name: 'Errand time', path: [], duration: 15 },
    ])
    // The original 45-minute activity is untouched.
    expect(state.entries[10].activities).toEqual([{ name: 'Homework', path: [], duration: 45 }])
  })

  it('selects a slot entirely consumed by spillover directly, rather than redirecting to the anchor', () => {
    // Follow-up fix: every 30-minute cell is independently selectable and
    // editable, including one 100% covered by an earlier anchor's spillover
    // (previously this redirected to the anchor, making the covered slot
    // impossible to open at all).
    const state = run(
      start(),
      { type: 'selectSlot', slot: 10 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 30 }, // 30 -> 60, covers 10 and 11 fully
      { type: 'commit' },
    )
    const selected = boardReducer(state, { type: 'selectSlot', slot: 11 })
    expect(selected.selectedSlot).toBe(11)
    // Nothing is written to 11 itself — the real record stays at its one
    // anchor (10); 11 is genuinely at capacity (0 minutes left).
    expect(selected.entries[11]).toBeUndefined()
    expect(selected.entries[10].activities).toEqual([
      { name: 'Homework', path: [], duration: 60 },
    ])
  })

  it('drops onto the leftover minutes of a partially-covered slot the same way clicking does', () => {
    const withLongActivity = run(
      start(),
      { type: 'selectSlot', slot: 10 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 15 },
      { type: 'commit' },
    )
    const dropped = boardReducer(withLongActivity, {
      type: 'dropCard',
      cardName: 'Errand time',
      slot: 11,
    })
    expect(dropped.selectedSlot).toBe(11)
    expect(dropped.staging.cardName).toBe('Errand time')
    // Offered duration is capped to the genuine 15 minutes left, not the
    // usual 30-minute default.
    expect(dropped.staging.duration).toBe(15)
  })
})

/* ---------------------------------------------------------------------------
 * SlotEditor's "In this slot" list acts on a spillover row's Edit/Remove.
 * There is only ever one copy of the activity — these prove both correctly
 * land on it, whichever slot the user started from.
 *
 * The two now differ deliberately: Edit dispatches a SINGLE `editActivity`
 * with an explicit `slot` (the anchor) and does NOT change `selectedSlot` —
 * editing in place, so the user is never navigated away just to trim a
 * spillover activity's duration (previously reported as "I can't edit this
 * slot"). Remove is more disruptive regardless (the row vanishes either way)
 * and its Undo affordance is anchor-scoped, so it still jumps there via
 * `selectSlot` first, same as before.
 * ------------------------------------------------------------------------- */
describe('editing or removing a spillover row acts on the one real activity at its anchor', () => {
  function withSpanningActivity(duration: number) {
    return run(
      start(),
      { type: 'selectSlot', slot: 10 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: duration - 30 },
      { type: 'commit' },
    )
  }

  it('"Edit" from a spillover row loads the real activity IN PLACE, without moving selectedSlot', () => {
    const state = withSpanningActivity(60) // spans 10 and 11
    // The user is looking at slot 11 (the spillover row), not the anchor.
    const viewing11 = boardReducer(state, { type: 'selectSlot', slot: 11 })
    expect(viewing11.selectedSlot).toBe(11)

    // Clicking "Edit" on 11's spillover row: SlotEditor dispatches exactly
    // this one action, naming the anchor explicitly via `slot`.
    const editing = boardReducer(viewing11, { type: 'editActivity', index: 0, slot: 10 })
    // Still on 11 — no jump.
    expect(editing.selectedSlot).toBe(11)
    expect(editing.staging).toMatchObject({
      cardName: 'Homework',
      editingIndex: 0,
      editingSlot: 10, // the real anchor `stepDuration`/`commit` will act on
      duration: 60, // the real total, never the 30-minute slot-clipped share
    })
  })

  it('shrinking the duration from an in-place spillover edit commits to the real anchor, still without moving selectedSlot', () => {
    const state = withSpanningActivity(60) // spans 10 and 11
    const viewing11 = boardReducer(state, { type: 'selectSlot', slot: 11 })
    const shrunk = run(
      viewing11,
      { type: 'editActivity', index: 0, slot: 10 },
      { type: 'stepDuration', delta: -15 }, // 60 -> 45
      { type: 'commit' },
    )
    expect(shrunk.selectedSlot).toBe(11)
    expect(shrunk.entries[10].activities).toEqual([{ name: 'Homework', path: [], duration: 45 }])
    // 15 minutes are freed in 11 — a different activity can now be added
    // there directly, no navigation required.
    const added = run(shrunk, { type: 'pickCard', cardName: 'Errand time' }, { type: 'commit' })
    expect(added.entries[11].activities).toEqual([{ name: 'Errand time', path: [], duration: 15 }])
  })

  it('"Remove" from a spillover row jumps to the anchor and removes the one real activity', () => {
    const state = withSpanningActivity(60)
    const viewing11 = boardReducer(state, { type: 'selectSlot', slot: 11 })

    const removed = run(
      viewing11,
      { type: 'selectSlot', slot: 10 },
      { type: 'removeActivity', index: 0 },
    )
    expect(removed.selectedSlot).toBe(10)
    expect(removed.entries[10]).toBeUndefined()
    // The undo affordance is scoped to the anchor slot — where the removal
    // actually happened, and where the editor has now landed.
    expect(removed.removal).toMatchObject({ slot: 10, activity: { name: 'Homework', duration: 60 } })
  })
})

describe('an activity spanning three or more slots', () => {
  it('leaves every spanned slot independently selectable, with nothing written to any of them', () => {
    const state = run(
      start(),
      { type: 'selectSlot', slot: 10 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 60 }, // 30 -> 90, spans 10, 11, 12
      { type: 'commit' },
    )
    expect(state.entries[10].activities).toEqual([{ name: 'Homework', path: [], duration: 90 }])

    for (const slot of [11, 12]) {
      const selected = boardReducer(state, { type: 'selectSlot', slot })
      expect(selected.selectedSlot).toBe(slot)
      expect(selected.entries[slot]).toBeUndefined()
    }

    // One slot past the span is an ordinary, unrelated empty slot.
    const pastTheSpan = boardReducer(state, { type: 'selectSlot', slot: 13 })
    expect(pastTheSpan.selectedSlot).toBe(13)
  })
})

describe('period navigation', () => {
  it('never changes which slot is selected', () => {
    const state = boardReducer(start(), { type: 'focusPeriod', period: 'night' })
    expect(state.focusedPeriod).toBe('night')
    expect(state.selectedSlot).toBe(32) // unchanged
    expect(state.jump?.period).toBe('night')
  })

  it('re-issues a jump token so a repeat tap pulses again', () => {
    let state = boardReducer(start(), { type: 'focusPeriod', period: 'night' })
    const first = state.jump?.token
    state = boardReducer(state, { type: 'focusPeriod', period: 'night' })
    expect(state.jump?.token).not.toBe(first)
  })
})
