import { describe, expect, it } from 'vitest'
import {
  boardReducer,
  createInitialState,
  isStagingComplete,
  stagingOptions,
  type BoardAction,
  type BoardState,
} from './boardReducer'
import type { ScheduledActivity } from '@/domain/types'

const AT_4PM = new Date(2026, 7, 25, 16, 0) // slot 32 (16:00)

function start(activities: ScheduledActivity[] = []): BoardState {
  return createInitialState(activities, AT_4PM)
}

function run(state: BoardState, ...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, state)
}

function byId(state: BoardState, id: string): ScheduledActivity | undefined {
  return state.activities.find((a) => a.id === id)
}

function real(state: BoardState): ScheduledActivity[] {
  return state.activities.filter((a) => a.name !== null)
}

/** No two real activities may ever overlap — the one hard invariant. */
function assertNoOverlaps(state: BoardState, context: string): void {
  const activities = real(state).slice().sort((a, b) => a.startMinutes - b.startMinutes)
  for (let i = 1; i < activities.length; i += 1) {
    const prevEnd = activities[i - 1].startMinutes + activities[i - 1].durationMinutes
    expect(activities[i].startMinutes, `overlap after ${context}`).toBeGreaterThanOrEqual(prevEnd)
  }
}

describe('initial state', () => {
  it('selects the slot containing the real current time', () => {
    expect(start().selectedSlot).toBe(32)
  })

  it('starts with no activities and no staging', () => {
    const state = start()
    expect(state.activities).toEqual([])
    expect(state.staging.cardName).toBeNull()
  })
})

describe('picking and committing a flat card', () => {
  it('stages at the selected slot’s start time, offering the default 30-minute duration', () => {
    const state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    expect(state.staging).toMatchObject({ cardName: 'Homework', startMinutes: 16 * 60, durationMinutes: 30, editingId: null })
    expect(state.activities).toEqual([]) // nothing written until commit
  })

  it('commits exactly one real activity with the staged time and duration', () => {
    const state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    expect(real(state)).toHaveLength(1)
    expect(real(state)[0]).toMatchObject({ name: 'Homework', startMinutes: 16 * 60, durationMinutes: 30, status: 'planned' })
    expect(state.staging.cardName).toBeNull()
  })

  it('allows any number of non-overlapping activities to share the same 30-minute grid cell — no 2-activity cap', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -20 }, // 30 -> 10
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'stepDuration', delta: -20 },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Meal Prep' },
      { type: 'pickOption', level: 0, value: 'Breakfast' },
      { type: 'stepDuration', delta: -20 },
      { type: 'commit' },
    )
    expect(real(state)).toHaveLength(3)
    assertNoOverlaps(state, 'three short activities in one cell')
  })

  it('refuses to stage a card once nothing may start at the selected slot at all', () => {
    const full = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const afterAttempt = boardReducer(full, { type: 'pickCard', cardName: 'Errand time' })
    expect(afterAttempt.staging.cardName).toBeNull()
  })
})

describe('drill-down', () => {
  it('requires a leaf before the activity can be committed', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Supplements' })
    expect(isStagingComplete(state.staging)).toBe(false)
    expect(stagingOptions(state.staging)?.options).toContain('Magnesium (post-dinner)')

    state = boardReducer(state, { type: 'pickOption', level: 0, value: 'Magnesium (post-dinner)' })
    expect(isStagingComplete(state.staging)).toBe(true)
  })

  it('goes three levels deep for Body Care (self) only', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Body Care (self)' })
    state = boardReducer(state, { type: 'pickOption', level: 0, value: 'Oiling' })
    expect(isStagingComplete(state.staging)).toBe(false)
    expect(stagingOptions(state.staging)).toEqual({ options: ['Face', 'Body', 'Hair'], level: 1 })

    state = boardReducer(state, { type: 'pickOption', level: 1, value: 'Hair' })
    expect(isStagingComplete(state.staging)).toBe(true)

    state = boardReducer(state, { type: 'commit' })
    expect(real(state)[0].path).toEqual(['Oiling', 'Hair'])
  })

  it('steps back one level at a time, then clears the card', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Body Care (self)' },
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

describe('editing an existing activity', () => {
  it('replaces rather than duplicating', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Supplements' },
      { type: 'pickOption', level: 0, value: 'Omega (post-lunch)' },
      { type: 'commit' },
    )
    expect(real(state)).toHaveLength(1)
    const id = real(state)[0].id

    state = boardReducer(state, { type: 'editActivity', id })
    expect(state.staging.editingId).toBe(id)
    expect(state.staging.path).toEqual(['Omega (post-lunch)'])

    state = boardReducer(state, { type: 'pickOption', level: 0, value: 'Zinc (post-breakfast)' })
    state = boardReducer(state, { type: 'commit' })

    expect(real(state)).toHaveLength(1)
    expect(real(state)[0].id).toBe(id) // same activity, not a new one
    expect(real(state)[0].path).toEqual(['Zinc (post-breakfast)'])
  })

  it('lets an edit reclaim its own time range and grow past the old ceiling', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' }, // 15 min
    )
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'editActivity', id })
    state = boardReducer(state, { type: 'stepDuration', delta: 500 })
    // Nothing else exists today, so it can grow all the way to day's end.
    expect(state.staging.durationMinutes).toBe(1440 - 16 * 60)
  })

  it('rule 4 — editing time/duration never silently clears completion', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const id = real(state)[0].id
    // Mark it completed via a direct state patch (Phase 3 wiring is exercised
    // in `domain/scheduling.test.ts`; here we only prove the reducer's commit
    // path never clears it).
    state = { ...state, activities: state.activities.map((a) => (a.id === id ? { ...a, status: 'completed' } : a)) }

    state = boardReducer(state, { type: 'editActivity', id })
    state = boardReducer(state, { type: 'stepDuration', delta: 10 })
    state = boardReducer(state, { type: 'commit' })

    expect(byId(state, id)?.status).toBe('completed')
    expect(byId(state, id)?.durationMinutes).toBe(40)
  })

  it('editing does not move `selectedSlot` — no more "jump to the anchor" is required', () => {
    // A 60-minute activity anchored at slot 20 (10:00) is viewed from slot 21
    // (10:30), which it merely continues through.
    let state = run(
      start(),
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 30 },
      { type: 'commit' },
    )
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'selectSlot', slot: 21 })
    state = boardReducer(state, { type: 'editActivity', id })
    expect(state.selectedSlot).toBe(21) // unchanged
    expect(state.staging.editingId).toBe(id)
    expect(state.staging.durationMinutes).toBe(60) // the real total, not a clipped share
  })
})

describe('remove and undo', () => {
  it('removes independently and restores in place', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
      { type: 'pickCard', cardName: 'Errand time' },
      { type: 'stepDuration', delta: -15 },
      { type: 'commit' },
    )
    expect(real(state)).toHaveLength(2)
    const [first, second] = real(state)

    state = boardReducer(state, { type: 'removeActivity', id: first.id })
    expect(real(state).map((a) => a.id)).toEqual([second.id])
    expect(state.removal?.activity.id).toBe(first.id)

    state = boardReducer(state, { type: 'undoRemoval' })
    expect(real(state).map((a) => a.id).sort()).toEqual([first.id, second.id].sort())
    expect(state.removal).toBeNull()
  })

  it('discards a stale restore rather than reintroducing an overlap', () => {
    // Repro: remove an activity, commit something else into the freed time,
    // then Undo — the restore must not silently overlap the new activity.
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' }, // 16:00-16:30
    )
    const removedId = real(state)[0].id
    state = boardReducer(state, { type: 'removeActivity', id: removedId })
    expect(state.removal).not.toBeNull()

    state = run(
      state,
      { type: 'pickCard', cardName: 'Meal Prep' },
      { type: 'pickOption', level: 0, value: 'Breakfast' },
      { type: 'commit' }, // refills 16:00-16:30
    )
    state = boardReducer(state, { type: 'undoRemoval' })

    expect(real(state)).toHaveLength(1)
    expect(real(state)[0].name).toBe('Meal Prep')
    assertNoOverlaps(state, 'stale undo after refill')
  })

  it('restores cleanly when the freed time genuinely remains free', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'removeActivity', id })
    state = boardReducer(state, { type: 'undoRemoval' })
    expect(real(state)).toHaveLength(1)
    expect(real(state)[0].id).toBe(id)
  })

  it('dismissRemoval only clears a removal matching the given id', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'removeActivity', id })
    const untouched = boardReducer(state, { type: 'dismissRemoval', id: 'not-the-one' })
    expect(untouched.removal).not.toBeNull()
    const cleared = boardReducer(state, { type: 'dismissRemoval', id })
    expect(cleared.removal).toBeNull()
  })
})

describe('toggleComplete — Phase 3 planned vs. actual', () => {
  it('marks a planned activity completed, and back again', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const id = real(state)[0].id
    expect(real(state)[0].status).toBe('planned')

    state = boardReducer(state, { type: 'toggleComplete', id })
    expect(real(state)[0].status).toBe('completed')

    state = boardReducer(state, { type: 'toggleComplete', id })
    expect(real(state)[0].status).toBe('planned')
  })

  it('touches nothing else about the activity — never a reschedule in disguise', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const before = real(state)[0]
    const id = before.id

    const after = boardReducer(state, { type: 'toggleComplete', id }).activities.find((a) => a.id === id)!
    expect(after.startMinutes).toBe(before.startMinutes)
    expect(after.durationMinutes).toBe(before.durationMinutes)
    expect(after.flags).toEqual(before.flags)
  })

  it('no-ops for an unknown id or a legacy flag-only marker', () => {
    // Legacy markers are read-only data now (nothing creates new ones —
    // see the "flags attach to the activity" describe block below) — a
    // literal fixture stands in for one that predates this change.
    const marker: ScheduledActivity = {
      id: 'legacy-marker',
      name: null,
      path: [],
      startMinutes: 0,
      durationMinutes: 0,
      flags: ['Attack'],
      quality: [], symptoms: [], notes: null,
      status: 'planned',
      timezone: 'UTC',
    }
    const state = start([marker])
    expect(boardReducer(state, { type: 'toggleComplete', id: 'legacy-marker' })).toBe(state)
    expect(boardReducer(state, { type: 'toggleComplete', id: 'no-such-id' })).toBe(state)
  })
})

describe('flags attach to the activity being logged, single-select', () => {
  it('a freshly picked card stages no flag', () => {
    const state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    expect(state.staging.flag).toBeNull()
  })

  it('setStagingFlag replaces rather than accumulates — never more than one', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'setStagingFlag', flag: 'Triggered' })
    expect(state.staging.flag).toBe('Triggered')
    state = boardReducer(state, { type: 'setStagingFlag', flag: 'Attack' })
    expect(state.staging.flag).toBe('Attack') // replaced, not added
  })

  it('"None" (null) clears the staged flag', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'setStagingFlag', flag: 'Attack' })
    state = boardReducer(state, { type: 'setStagingFlag', flag: null })
    expect(state.staging.flag).toBeNull()
  })

  it('commit attaches the staged flag to the real activity as a 0-or-1 element array', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setStagingFlag', flag: 'Trauma Activation' },
      { type: 'commit' },
    )
    expect(real(state)[0].flags).toEqual(['Trauma Activation'])

    state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    expect(real(state)[0].flags).toEqual([])
  })

  it('editing an activity re-stages its own existing flag, and Save can change or clear it', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setStagingFlag', flag: 'Triggered' },
      { type: 'commit' },
    )
    const id = real(state)[0].id

    state = boardReducer(state, { type: 'editActivity', id })
    expect(state.staging.flag).toBe('Triggered')

    state = run(state, { type: 'setStagingFlag', flag: null }, { type: 'commit' })
    expect(real(state)[0].flags).toEqual([])
  })

  it('flags never consume schedule room or block placement — untouched by rule 1', () => {
    const state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setStagingFlag', flag: 'Attack' },
      { type: 'commit' },
    )
    expect(real(state)[0].durationMinutes).toBe(30) // unaffected by the flag
  })
})

/* ---------------------------------------------------------------------------
 * Drag and drop is the manual flow, not a second placement path.
 * ------------------------------------------------------------------------- */
describe('drag and drop', () => {
  const DROP: BoardAction = { type: 'dropCard', cardName: 'Errand time', slot: 20 }

  it('stages a dropped card against the dropped slot instead of committing it', () => {
    const state = boardReducer(start(), DROP)
    expect(state.selectedSlot).toBe(20)
    expect(state.staging.cardName).toBe('Errand time')
    expect(state.staging.editingId).toBeNull()
    expect(state.staging.durationMinutes).toBe(30)
    expect(state.activities).toEqual([])
  })

  it('is exactly "select the slot, then pick the card"', () => {
    const dropped = boardReducer(start(), DROP)
    const manual = run(start(), { type: 'selectSlot', slot: 20 }, { type: 'pickCard', cardName: 'Errand time' })
    expect(dropped).toEqual(manual)
  })

  it('commits the dropped card only on an explicit confirm', () => {
    const state = run(start(), DROP, { type: 'commit' })
    expect(real(state)).toEqual([
      expect.objectContaining({ name: 'Errand time', startMinutes: 10 * 60, durationMinutes: 30 }),
    ])
  })

  it('lets the duration be adjusted before the confirm', () => {
    const state = run(start(), DROP, { type: 'stepDuration', delta: -15 }, { type: 'commit' })
    expect(real(state)[0].durationMinutes).toBe(15)
  })

  it('discards the pending drop on cancel', () => {
    const state = run(start(), DROP, { type: 'cancelStaging' })
    expect(state.staging.cardName).toBeNull()
    expect(state.activities).toEqual([])
    expect(state.selectedSlot).toBe(20)
  })

  it('opens the sub-picker instead of guessing a sub-option', () => {
    const state = boardReducer(start(), { type: 'dropCard', cardName: 'Supplements', slot: 20 })
    expect(state.activities).toEqual([])
    expect(state.staging.cardName).toBe('Supplements')
    expect(isStagingComplete(state.staging)).toBe(false)
  })

  it('reuses the manual flow’s conflict handling when the duration is grown', () => {
    // Something occupies 11:00-11:30. A card dropped at 10:00 (slot 20) may
    // grow, but must stop dead at 11:00 rather than overwriting or truncating it.
    const occupied = start([
      { id: 'x', name: 'Meal Prep', path: [], startMinutes: 11 * 60, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ])
    const state = run(occupied, DROP, { type: 'stepDuration', delta: 300 })
    expect(state.staging.durationMinutes).toBe(60)

    const committed = boardReducer(state, { type: 'commit' })
    expect(real(committed).find((a) => a.name === 'Errand time')).toMatchObject({ durationMinutes: 60 })
    expect(real(committed).find((a) => a.name === 'Meal Prep')).toMatchObject({ durationMinutes: 30 })
    assertNoOverlaps(committed, 'drop grown up to an occupied neighbour')
  })

  it('resolves a drop onto a cell covered by an earlier, longer activity to the real free instant', () => {
    // A 60-minute activity anchored at slot 20 (10:00-11:00) fully covers
    // slot 21. Dropping there selects slot 21 (every cell is independently
    // selectable) but the picker offers nothing, since no time is free there.
    const covered = start([
      { id: 'x', name: 'Meal Prep', path: [], startMinutes: 10 * 60, durationMinutes: 60, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ])
    const state = boardReducer(covered, { type: 'dropCard', cardName: 'Errand time', slot: 21 })
    expect(state.selectedSlot).toBe(21)
    expect(state.staging.cardName).toBeNull()
  })
})

describe('a slot partially covered by an earlier, longer activity', () => {
  it('accepts a new activity into its genuine leftover minutes, resolved to the real free instant', () => {
    // A 45-minute activity anchored at slot 10 (05:00) covers all of slot 10
    // and the first 15 minutes of slot 11, leaving slot 11 with 15 free
    // minutes of its own.
    let state = run(
      start(),
      { type: 'selectSlot', slot: 10 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 15 }, // 30 -> 45
      { type: 'commit' },
    )
    state = boardReducer(state, { type: 'selectSlot', slot: 11 })
    expect(state.selectedSlot).toBe(11)

    state = run(state, { type: 'pickCard', cardName: 'Errand time' }, { type: 'commit' })
    const errand = real(state).find((a) => a.name === 'Errand time')!
    expect(errand.startMinutes).toBe(5 * 60 + 45) // the real free instant, not the raw slot boundary
    // Unlike the old 30-minutes-per-cell cap, nothing else caps the default
    // duration here — it is free to run past this grid cell's own boundary,
    // since no other activity blocks it.
    expect(errand.durationMinutes).toBe(30)
    assertNoOverlaps(state, 'partial leftover placement')
  })
})

describe('capacity holds under arbitrary action sequences — property test', () => {
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

  function randomAction(state: BoardState, next: () => number): BoardAction {
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]
    const someId = () => (real(state).length > 0 ? pick(real(state)).id : 'missing')
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
        return { type: 'removeActivity', id: someId() }
      case 6:
        return { type: 'undoRemoval' }
      case 7:
        return { type: 'editActivity', id: someId() }
      default:
        return { type: 'dropCard', cardName: pick(CARDS), slot: pick(SLOTS) }
    }
  }

  it('never lets two real activities overlap, across many random sequences', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = rng(seed)
      let state = start()
      for (let step = 0; step < 120; step += 1) {
        const action = randomAction(state, next)
        state = boardReducer(state, action)
        assertNoOverlaps(state, `seed ${seed} step ${step} (${action.type})`)
      }
    }
  })
})

describe('an activity spanning three or more grid cells', () => {
  it('leaves every spanned cell independently selectable, with the one real activity reachable from any of them', () => {
    let state = run(
      start(),
      { type: 'selectSlot', slot: 10 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 60 }, // 30 -> 90, spans slots 10, 11, 12
      { type: 'commit' },
    )
    expect(real(state)[0].durationMinutes).toBe(90)
    const id = real(state)[0].id

    for (const slot of [11, 12]) {
      const selected = boardReducer(state, { type: 'selectSlot', slot })
      expect(selected.selectedSlot).toBe(slot)
      // The one real activity is unchanged and still reachable by id.
      expect(byId(selected, id)).toBeDefined()
    }
  })
})

describe('stepDuration — R2.2 regression: floor must be a multiple of 5, never 1', () => {
  it('bottoms out at 5, and stepping back up lands on 5, 10, 15... never 6, 11, 16...', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' }) // 30

    // Step down well past the old broken floor of 1.
    for (let i = 0; i < 10; i += 1) {
      state = boardReducer(state, { type: 'stepDuration', delta: -5 })
      expect(state.staging.durationMinutes % 5).toBe(0)
      expect(state.staging.durationMinutes).toBeGreaterThanOrEqual(5)
    }
    expect(state.staging.durationMinutes).toBe(5) // floor is 5, not 1

    // One more step down is a no-op at the floor — never goes to 0 or below.
    state = boardReducer(state, { type: 'stepDuration', delta: -5 })
    expect(state.staging.durationMinutes).toBe(5)

    // Step back up: every value must be an exact multiple of 5.
    const expected = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
    for (const target of expected) {
      state = boardReducer(state, { type: 'stepDuration', delta: 5 })
      expect(state.staging.durationMinutes).toBe(target)
    }
  })
})

describe('setDuration — R2.3 free-form entry and R2.4 quick-add', () => {
  it('commits an exact typed value with no snapping to the 5-minute grid', () => {
    const state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setDuration', minutes: 37 },
    )
    expect(state.staging.durationMinutes).toBe(37)
  })

  it('clamps a typed value down to the same continuous-block ceiling the stepper respects', () => {
    // Something else starts 50 minutes after 16:00 (the pinned "now" slot).
    const occupied = start([
      { id: 'x', name: 'Meal Prep', path: [], startMinutes: 16 * 60 + 50, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ])
    const state = run(
      occupied,
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setDuration', minutes: 500 },
    )
    expect(state.staging.durationMinutes).toBe(50)
    const committed = boardReducer(state, { type: 'commit' })
    assertNoOverlaps(committed, 'setDuration clamped to the ceiling')
  })

  it('floors at 1 whole positive minute — never 0 or negative — regardless of what was typed', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'setDuration', minutes: 0 })
    expect(state.staging.durationMinutes).toBe(1)
    state = boardReducer(state, { type: 'setDuration', minutes: -20 })
    expect(state.staging.durationMinutes).toBe(1)
  })

  it('quick-add is additive — it adds to whatever is already staged, never sets outright', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }) // 30
    // "+30min": component dispatches current + 30.
    state = boardReducer(state, { type: 'setDuration', minutes: state.staging.durationMinutes + 30 })
    expect(state.staging.durationMinutes).toBe(60)
    // "+1hr" on top of that.
    state = boardReducer(state, { type: 'setDuration', minutes: state.staging.durationMinutes + 60 })
    expect(state.staging.durationMinutes).toBe(120)
    // "+2hr" on top of that.
    state = boardReducer(state, { type: 'setDuration', minutes: state.staging.durationMinutes + 120 })
    expect(state.staging.durationMinutes).toBe(240)
  })

  it('quick-add also clamps to the ceiling rather than creating an overlap', () => {
    const occupied = start([
      { id: 'x', name: 'Meal Prep', path: [], startMinutes: 16 * 60 + 40, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ])
    let state = run(occupied, { type: 'pickCard', cardName: 'Homework' }) // clamped to 30 already? verify below
    // Add a full 2 hours — far more than the 40-minute ceiling allows.
    state = boardReducer(state, { type: 'setDuration', minutes: state.staging.durationMinutes + 120 })
    expect(state.staging.durationMinutes).toBe(40)
    const committed = boardReducer(state, { type: 'commit' })
    assertNoOverlaps(committed, 'quick-add clamped to the ceiling')
  })

  it('goes through the same validate/commit pipeline as the stepper — rule 4 still holds', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setDuration', minutes: 37 },
      { type: 'commit' },
    )
    const id = real(state)[0].id
    state = { ...state, activities: state.activities.map((a) => (a.id === id ? { ...a, status: 'completed' } : a)) }

    state = boardReducer(state, { type: 'editActivity', id })
    state = boardReducer(state, { type: 'setDuration', minutes: 52 })
    state = boardReducer(state, { type: 'commit' })

    expect(byId(state, id)?.status).toBe('completed')
    expect(byId(state, id)?.durationMinutes).toBe(52)
  })
})

describe('setStagingStart — duration drag-block, moving the whole pill', () => {
  it('moves the staged start, duration unchanged', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' }) // 16:00, 30 min
    state = boardReducer(state, { type: 'setStagingStart', minutes: 16 * 60 + 30 })
    expect(state.staging.startMinutes).toBe(16 * 60 + 30)
    expect(state.staging.durationMinutes).toBe(30)
  })

  it('hard-stops at a neighbouring activity rather than overlapping it', () => {
    const occupied = start([
      { id: 'x', name: 'Meal Prep', path: [], startMinutes: 17 * 60, durationMinutes: 30, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ])
    let state = boardReducer(occupied, { type: 'pickCard', cardName: 'Homework' }) // 16:00, 30 min
    state = boardReducer(state, { type: 'setStagingStart', minutes: 18 * 60 })
    expect(state.staging.startMinutes).toBe(16 * 60 + 30) // clamped to the neighbour's start - duration
  })

  it('no-ops with no staged card', () => {
    const state = start()
    expect(boardReducer(state, { type: 'setStagingStart', minutes: 100 })).toBe(state)
  })
})

describe('resizeStagingStart — duration drag-block, resizing from the start handle', () => {
  it('moves the start and shrinks/grows duration, keeping the end fixed', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' }) // 16:00-16:30
    state = boardReducer(state, { type: 'resizeStagingStart', minutes: 16 * 60 + 10 })
    expect(state.staging.startMinutes).toBe(16 * 60 + 10)
    expect(state.staging.durationMinutes).toBe(20) // end stays 16:30
  })

  it('hard-stops against a preceding activity rather than overlapping it', () => {
    const occupied = start([
      { id: 'x', name: 'Meal Prep', path: [], startMinutes: 15 * 60 + 45, durationMinutes: 10, flags: [], quality: [], symptoms: [], notes: null, status: 'planned', timezone: 'UTC' },
    ])
    let state = boardReducer(occupied, { type: 'pickCard', cardName: 'Homework' }) // 16:00-16:30
    state = boardReducer(state, { type: 'resizeStagingStart', minutes: 15 * 60 + 30 })
    expect(state.staging.startMinutes).toBe(15 * 60 + 55) // clamped to the neighbour's end
  })

  it('never shrinks below 1 minute', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' }) // 16:00-16:30
    state = boardReducer(state, { type: 'resizeStagingStart', minutes: 17 * 60 })
    expect(state.staging.durationMinutes).toBe(1)
  })
})

describe('toggleStagingQuality — "Activity quality" (multi-select, SCRUM-10)', () => {
  it('defaults to an empty array for a freshly picked card', () => {
    const state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    expect(state.staging.quality).toEqual([])
  })

  it('adds a quality not yet present', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'toggleStagingQuality', quality: 'Flow' })
    expect(state.staging.quality).toEqual(['Flow'])
  })

  it('accumulates — more than one quality may be staged at once', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'toggleStagingQuality', quality: 'Flow' })
    state = boardReducer(state, { type: 'toggleStagingQuality', quality: 'Draining' })
    expect(state.staging.quality).toEqual(['Flow', 'Draining'])
  })

  it('removes an already-staged quality on a second toggle, leaving the rest', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'toggleStagingQuality', quality: 'Flow' })
    state = boardReducer(state, { type: 'toggleStagingQuality', quality: 'Draining' })
    state = boardReducer(state, { type: 'toggleStagingQuality', quality: 'Flow' })
    expect(state.staging.quality).toEqual(['Draining'])
  })

  it('commit attaches every staged quality to the real activity; none commits as an empty array', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'toggleStagingQuality', quality: 'Nourishing' },
      { type: 'toggleStagingQuality', quality: 'Energizing' },
      { type: 'commit' },
    )
    expect(real(state)[0].quality).toEqual(['Nourishing', 'Energizing'])

    state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    expect(real(state)[0].quality).toEqual([])
  })

  it('editing an activity re-stages its own existing quality selections', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'toggleStagingQuality', quality: 'Scattered' },
      { type: 'commit' },
    )
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'editActivity', id })
    expect(state.staging.quality).toEqual(['Scattered'])
  })
})

describe('toggleStagingSymptom — "Chronic Symptoms" (multi-select, like quality, unlike flag)', () => {
  it('defaults to an empty array for a freshly picked card', () => {
    const state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    expect(state.staging.symptoms).toEqual([])
  })

  it('adds a symptom not yet present', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'toggleStagingSymptom', symptom: 'Pitta' })
    expect(state.staging.symptoms).toEqual(['Pitta'])
  })

  it('accumulates — unlike flag, more than one may be staged at once', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'toggleStagingSymptom', symptom: 'Pitta' })
    state = boardReducer(state, { type: 'toggleStagingSymptom', symptom: 'Dryness' })
    expect(state.staging.symptoms).toEqual(['Pitta', 'Dryness'])
  })

  it('removes an already-staged symptom on a second toggle, leaving the rest', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'toggleStagingSymptom', symptom: 'Pitta' })
    state = boardReducer(state, { type: 'toggleStagingSymptom', symptom: 'Dryness' })
    state = boardReducer(state, { type: 'toggleStagingSymptom', symptom: 'Pitta' })
    expect(state.staging.symptoms).toEqual(['Dryness'])
  })

  it('commit attaches every staged symptom to the real activity; none commits as an empty array', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'toggleStagingSymptom', symptom: 'Pitta' },
      { type: 'toggleStagingSymptom', symptom: 'Right knee pain' },
      { type: 'commit' },
    )
    expect(real(state)[0].symptoms).toEqual(['Pitta', 'Right knee pain'])

    state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    expect(real(state)[0].symptoms).toEqual([])
  })

  it('editing an activity re-stages its own existing symptoms', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'toggleStagingSymptom', symptom: 'Temporal pain' },
      { type: 'commit' },
    )
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'editActivity', id })
    expect(state.staging.symptoms).toEqual(['Temporal pain'])
  })
})

describe('setStagingNotes — freeform notes', () => {
  it('defaults to an empty string for a freshly picked card', () => {
    const state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    expect(state.staging.notes).toBe('')
  })

  it('stages exactly the typed text, replacing any prior draft', () => {
    let state = boardReducer(start(), { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'setStagingNotes', notes: 'Felt' })
    expect(state.staging.notes).toBe('Felt')
    state = boardReducer(state, { type: 'setStagingNotes', notes: 'Felt good' })
    expect(state.staging.notes).toBe('Felt good')
  })

  it('commit attaches the staged notes to the real activity; an empty/blank draft commits as null, never an empty string', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setStagingNotes', notes: 'Went well.' },
      { type: 'commit' },
    )
    expect(real(state)[0].notes).toBe('Went well.')

    state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    expect(real(state)[0].notes).toBeNull()

    state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setStagingNotes', notes: '   ' },
      { type: 'commit' },
    )
    expect(real(state)[0].notes).toBeNull()
  })

  it('editing an activity re-stages its own existing notes', () => {
    let state = run(
      start(),
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'setStagingNotes', notes: 'A note worth keeping.' },
      { type: 'commit' },
    )
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'editActivity', id })
    expect(state.staging.notes).toBe('A note worth keeping.')
  })

  it('editing an activity with no prior notes re-stages an empty string, not null', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'editActivity', id })
    expect(state.staging.notes).toBe('')
  })
})

describe('selectActivity — clicking an activity’s own rendered timeline segment', () => {
  it('is exactly "select the slot the activity starts in, then edit that activity"', () => {
    let state = run(
      start(),
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
    )
    const id = real(state)[0].id
    // Deliberately viewed from an unrelated slot first, so the effect below
    // can only be `selectActivity`'s own doing.
    state = boardReducer(state, { type: 'selectSlot', slot: 5 })

    const viaSelectActivity = boardReducer(state, { type: 'selectActivity', id })
    const viaManualFlow = run(state, { type: 'selectSlot', slot: 20 }, { type: 'editActivity', id })
    expect(viaSelectActivity).toEqual(viaManualFlow)
  })

  it('jumps to the activity’s own start slot, and opens it for edit', () => {
    let state = run(
      start(),
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'commit' },
    )
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'selectSlot', slot: 5 })

    state = boardReducer(state, { type: 'selectActivity', id })
    expect(state.selectedSlot).toBe(20)
    expect(state.staging.editingId).toBe(id)
    expect(state.staging.cardName).toBe('Homework')
  })

  it('jumps to the start slot even when the activity was clicked mid-span, not at its start', () => {
    // A 90-minute activity anchored at slot 20 (10:00) reaches into slot 22
    // (11:00-11:30) — clicking that later segment still resolves to slot 20.
    let state = run(
      start(),
      { type: 'selectSlot', slot: 20 },
      { type: 'pickCard', cardName: 'Homework' },
      { type: 'stepDuration', delta: 60 }, // 30 -> 90
      { type: 'commit' },
    )
    const id = real(state)[0].id
    state = boardReducer(state, { type: 'selectSlot', slot: 0 })

    state = boardReducer(state, { type: 'selectActivity', id })
    expect(state.selectedSlot).toBe(20)
    expect(state.staging.editingId).toBe(id)
  })

  it('rule 4 — never touches completion status just by opening the editor', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const id = real(state)[0].id
    state = { ...state, activities: state.activities.map((a) => (a.id === id ? { ...a, status: 'completed' } : a)) }

    state = boardReducer(state, { type: 'selectActivity', id })
    expect(state.staging.editingId).toBe(id)
    expect(byId(state, id)?.status).toBe('completed') // unchanged — nothing committed yet
  })

  it('guards against an unknown id — state is returned unchanged, selectedSlot untouched', () => {
    const state = boardReducer(start(), { type: 'selectSlot', slot: 5 })
    const after = boardReducer(state, { type: 'selectActivity', id: 'does-not-exist' })
    expect(after).toBe(state) // same reference — no-op, exactly `editActivity`'s own guard
  })

  it('guards against a flag-only marker (name === null) — never opens it for edit', () => {
    const markerActivity: ScheduledActivity = {
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
    const state = boardReducer(start([markerActivity]), { type: 'selectSlot', slot: 5 })
    const after = boardReducer(state, { type: 'selectActivity', id: 'marker-1' })
    expect(after).toBe(state)
  })

  it('never commits — the activity’s own fields are unchanged until an explicit Save', () => {
    let state = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'commit' })
    const id = real(state)[0].id
    const before = byId(state, id)

    state = boardReducer(state, { type: 'selectActivity', id })
    state = boardReducer(state, { type: 'stepDuration', delta: 15 }) // staged only, not committed
    expect(byId(state, id)).toEqual(before)
    expect(state.staging.durationMinutes).toBe(45)
  })
})
