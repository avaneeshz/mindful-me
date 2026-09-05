import { describe, expect, it } from 'vitest'
import {
  clampDuration,
  clampMove,
  clampResizeStart,
  clampStepDuration,
  commitSchedule,
  computeCandidateSchedule,
  DEFAULT_DURATION_MINUTES,
  DURATION_STEP_MINUTES,
  generateId,
  isWindowFull,
  MIN_DURATION_MINUTES,
  maxContiguousDuration,
  MINUTES_PER_DAY,
  moveBounds,
  nextFreeStart,
  resizeStartBounds,
  splitMinutesAcrossDays,
  validateSchedule,
  type CandidateSchedule,
} from './scheduling'
import type { ScheduledActivity } from './types'

function make(
  startMinutes: number,
  durationMinutes: number,
  overrides: Partial<ScheduledActivity> = {},
): ScheduledActivity {
  return {
    id: overrides.id ?? generateId(),
    name: 'Homework',
    path: [],
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [], symptoms: [], notes: null,
    status: 'planned',
    timezone: 'UTC',
    ...overrides,
  }
}

describe('nextFreeStart', () => {
  it('returns the requested minute when nothing occupies it', () => {
    expect(nextFreeStart([], 600)).toBe(600)
    expect(nextFreeStart([make(0, 30)], 600)).toBe(600)
  })

  it('jumps to the end of whatever activity covers the requested minute', () => {
    const existing = [make(600, 45)] // 10:00–10:45
    expect(nextFreeStart(existing, 600)).toBe(645)
    expect(nextFreeStart(existing, 620)).toBe(645) // mid-activity request also resolves forward
    expect(nextFreeStart(existing, 645)).toBe(645) // exactly at the boundary: free
  })

  it('chains across back-to-back activities', () => {
    const existing = [make(600, 30), make(630, 30), make(660, 15)]
    expect(nextFreeStart(existing, 600)).toBe(675)
  })

  it('excludes the activity being edited from blocking itself', () => {
    const existing = [make(600, 30, { id: 'a' })]
    expect(nextFreeStart(existing, 600, 'a')).toBe(600)
    expect(nextFreeStart(existing, 600, 'other-id')).toBe(630)
  })

  it('never treats a flag marker (zero duration) as a blocker', () => {
    const marker = make(600, 0, { name: null })
    expect(nextFreeStart([marker], 600)).toBe(600)
  })
})

describe('maxContiguousDuration — rule 13, the continuous-block ceiling', () => {
  it('offers the rest of the day when nothing else exists', () => {
    expect(maxContiguousDuration([], 600)).toBe(MINUTES_PER_DAY - 600)
  })

  it('is 0 when the start minute itself is already occupied', () => {
    expect(maxContiguousDuration([make(600, 30)], 610)).toBe(0)
  })

  it('caps at the next activity’s start — never offers to split across it', () => {
    const existing = [make(660, 30)] // occupied 11:00–11:30
    expect(maxContiguousDuration(existing, 600)).toBe(60) // exactly up to 11:00
  })

  it('ignores an activity that starts before the requested start', () => {
    const existing = [make(500, 30)] // ends 8:30, well before 10:00
    expect(maxContiguousDuration(existing, 600)).toBe(MINUTES_PER_DAY - 600)
  })

  it('excludes the activity being edited, including from being its own ceiling', () => {
    const existing = [make(600, 60, { id: 'a' }), make(700, 30, { id: 'b' })]
    // Editing "a" in place: ceiling is bounded by "b" at 700, not by "a" itself.
    expect(maxContiguousDuration(existing, 600, 'a')).toBe(100)
  })
})

describe('rule 1 — no two activities may ever overlap', () => {
  it('rejects a candidate that overlaps an existing activity', () => {
    const existing = [make(600, 60)] // 10:00–11:00
    const overlapping: CandidateSchedule = { id: null, activity: { name: 'X', path: [] }, startMinutes: 630, durationMinutes: 30 }
    const result = validateSchedule(overlapping, existing)
    expect(result.ok).toBe(false)
  })

  it('accepts a candidate that starts exactly when the previous one ends', () => {
    const existing = [make(600, 60)] // ends 11:00
    const adjacent: CandidateSchedule = { id: null, activity: { name: 'X', path: [] }, startMinutes: 660, durationMinutes: 30 }
    expect(validateSchedule(adjacent, existing)).toEqual({ ok: true })
  })

  it('rejects a candidate anchored exactly on an existing activity’s start', () => {
    const existing = [make(600, 30)]
    const candidate: CandidateSchedule = { id: null, activity: { name: 'X', path: [] }, startMinutes: 600, durationMinutes: 15 }
    const result = validateSchedule(candidate, existing)
    expect(result).toEqual({ ok: false, reason: 'occupied', maxDuration: 0 })
  })

  it('rejects a candidate whose duration reaches past the next activity, reporting the true ceiling', () => {
    const existing = [make(660, 30)] // 11:00–11:30
    const candidate: CandidateSchedule = { id: null, activity: { name: 'X', path: [] }, startMinutes: 600, durationMinutes: 90 }
    const result = validateSchedule(candidate, existing)
    expect(result).toEqual({ ok: false, reason: 'too-long', maxDuration: 60 })
  })

  it('a validated, committed pair never overlaps each other in the resulting board', () => {
    const first = commitSchedule(
      computeCandidateSchedule({ name: 'A', path: [] }, 600, [], { requestedDuration: 45 }),
    )
    const second = commitSchedule(
      computeCandidateSchedule({ name: 'B', path: [] }, 620, [first], { requestedDuration: 45 }),
    )
    // B could not fit at 620 (A runs until 645), so it was pushed to 645.
    expect(second.startMinutes).toBe(645)
    expect(first.startMinutes + first.durationMinutes).toBeLessThanOrEqual(second.startMinutes)
  })
})

describe('rule 13 — never auto-split across two disjoint gaps', () => {
  it('offers the max contiguous run instead of hopping over an obstacle', () => {
    // Free 10:00–10:30, occupied 10:30–11:00, free again 11:00–13:00. A
    // request for 90 minutes starting at 10:00 must clamp to 30 (the first
    // gap only) — never silently jump to use the second gap too.
    const existing = [make(630, 30)]
    const candidate = computeCandidateSchedule({ name: 'X', path: [] }, 600, existing, {
      requestedDuration: 90,
    })
    expect(candidate.startMinutes).toBe(600)
    expect(candidate.durationMinutes).toBe(30)
    expect(validateSchedule(candidate, existing)).toEqual({ ok: true })
  })
})

describe('computeCandidateSchedule', () => {
  it('defaults to 30 minutes, clamped to whatever room actually exists', () => {
    const candidate = computeCandidateSchedule({ name: 'X', path: [] }, 600, [])
    expect(candidate.durationMinutes).toBe(DEFAULT_DURATION_MINUTES)
  })

  it('resolves the anchor forward to the real free instant, not the raw requested minute', () => {
    const existing = [make(600, 20)] // occupied 10:00–10:20
    const candidate = computeCandidateSchedule({ name: 'X', path: [] }, 600, existing)
    expect(candidate.startMinutes).toBe(620)
  })

  it('lets an in-place edit reclaim its own time range', () => {
    const existing = [make(600, 30, { id: 'a' })]
    const candidate = computeCandidateSchedule({ name: 'Homework', path: [] }, 600, existing, {
      editingId: 'a',
      requestedDuration: 60,
    })
    expect(candidate).toEqual({ id: 'a', activity: { name: 'Homework', path: [] }, startMinutes: 600, durationMinutes: 60 })
  })
})

describe('clampDuration', () => {
  it('clamps into [MIN_DURATION_MINUTES, ceiling]', () => {
    expect(clampDuration(45, 60)).toBe(45)
    expect(clampDuration(90, 60)).toBe(60)
    expect(clampDuration(0, 60)).toBe(MIN_DURATION_MINUTES)
    expect(clampDuration(-5, 60)).toBe(MIN_DURATION_MINUTES)
  })

  it('returns 0 when the ceiling itself is below the minimum', () => {
    expect(clampDuration(30, 0)).toBe(0)
  })

  it('never snaps to any step — any exact minute is a legal duration', () => {
    expect(clampDuration(47, 90)).toBe(47)
  })
})

describe('clampStepDuration — the stepper-only clamp (R2.2 regression)', () => {
  it('floors at DURATION_STEP_MINUTES (5), never at MIN_DURATION_MINUTES (1)', () => {
    expect(clampStepDuration(0, 300)).toBe(DURATION_STEP_MINUTES)
    expect(clampStepDuration(-5, 300)).toBe(DURATION_STEP_MINUTES)
    expect(clampStepDuration(1, 300)).toBe(DURATION_STEP_MINUTES)
  })

  it('clamps into [DURATION_STEP_MINUTES, ceiling] otherwise exactly like clampDuration', () => {
    expect(clampStepDuration(45, 60)).toBe(45)
    expect(clampStepDuration(90, 60)).toBe(60)
  })

  it('returns 0 when the ceiling itself is below the minimum', () => {
    expect(clampStepDuration(30, 0)).toBe(0)
  })

  it(
    'stepping down to the floor and back up never drifts off the 5-minute grid ' +
      '(the reported bug: bottoming out at 1, then climbing 6, 11, 16... instead of 5, 10, 15...)',
    () => {
      const ceiling = 300 // plenty of room — never the binding constraint here
      let duration = DEFAULT_DURATION_MINUTES // 30

      // Step down past the floor several times over — every intermediate
      // value must already be a clean multiple of 5, and it must never go
      // below the floor.
      for (let i = 0; i < 10; i += 1) {
        duration = clampStepDuration(duration - DURATION_STEP_MINUTES, ceiling)
        expect(duration % DURATION_STEP_MINUTES).toBe(0)
        expect(duration).toBeGreaterThanOrEqual(DURATION_STEP_MINUTES)
      }
      expect(duration).toBe(DURATION_STEP_MINUTES) // bottomed out at 5, not 1

      // Now step back up from the floor — every intermediate value must land
      // exactly on 5, 10, 15, 20... never 6, 11, 16, 21...
      const expected = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
      for (const target of expected) {
        duration = clampStepDuration(duration + DURATION_STEP_MINUTES, ceiling)
        expect(duration % DURATION_STEP_MINUTES).toBe(0)
        expect(duration).toBe(target)
      }
    },
  )
})

describe('isWindowFull', () => {
  it('is false when at least one minute of the window is free', () => {
    expect(isWindowFull([make(600, 29)], 600, 30)).toBe(false)
  })

  it('is true only once the whole window is genuinely occupied', () => {
    expect(isWindowFull([make(600, 30)], 600, 30)).toBe(true)
  })
})

describe('rule 4 — editing time/duration never silently clears completion', () => {
  it('carries the prior status and flags forward on an in-place edit', () => {
    const prior = make(600, 30, { id: 'a', status: 'completed', flags: ['Triggered'] })
    const candidate = computeCandidateSchedule({ name: 'Homework', path: [] }, 660, [prior], {
      editingId: 'a',
    })
    const committed = commitSchedule(candidate, {
      id: prior.id,
      flags: prior.flags,
      status: prior.status,
      timezone: prior.timezone,
    })
    expect(committed.status).toBe('completed')
    expect(committed.flags).toEqual(['Triggered'])
    expect(committed.startMinutes).toBe(660)
  })

  it('a brand-new activity defaults to planned, never completed', () => {
    const committed = commitSchedule(computeCandidateSchedule({ name: 'X', path: [] }, 0, []))
    expect(committed.status).toBe('planned')
  })
})

describe('rule 2 — midnight-crossing ownership', () => {
  it('attributes every minute to today when the activity does not cross midnight', () => {
    expect(splitMinutesAcrossDays(600, 60)).toEqual({ sameDayMinutes: 60, nextDayMinutes: 0 })
  })

  it('splits an activity that starts before midnight and ends after it', () => {
    // 23:00 (1380) for 90 minutes: 60 minutes left in today, 30 minutes into tomorrow.
    expect(splitMinutesAcrossDays(1380, 90)).toEqual({ sameDayMinutes: 60, nextDayMinutes: 30 })
  })

  it('attributes an activity landing exactly on the boundary entirely to today', () => {
    expect(splitMinutesAcrossDays(1380, 60)).toEqual({ sameDayMinutes: 60, nextDayMinutes: 0 })
  })

  it('handles an activity that starts at midnight itself (never crosses)', () => {
    expect(splitMinutesAcrossDays(0, 480)).toEqual({ sameDayMinutes: 480, nextDayMinutes: 0 })
  })

  it('the two halves always sum back to the full duration', () => {
    for (let start = 0; start < 1440; start += 47) {
      for (const duration of [1, 30, 90, 500]) {
        const { sameDayMinutes, nextDayMinutes } = splitMinutesAcrossDays(start, duration)
        expect(sameDayMinutes + nextDayMinutes).toBe(duration)
        expect(sameDayMinutes).toBeGreaterThanOrEqual(0)
        expect(nextDayMinutes).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('commitSchedule', () => {
  it('assigns a fresh id to a brand-new activity', () => {
    const a = commitSchedule(computeCandidateSchedule({ name: 'X', path: [] }, 0, []))
    const b = commitSchedule(computeCandidateSchedule({ name: 'X', path: [] }, 100, []))
    expect(a.id).not.toBe(b.id)
  })

  it('preserves the id of an edited activity rather than minting a new one', () => {
    const candidate: CandidateSchedule = { id: 'existing-id', activity: { name: 'X', path: [] }, startMinutes: 0, durationMinutes: 30 }
    const committed = commitSchedule(candidate, { id: 'existing-id' })
    expect(committed.id).toBe('existing-id')
  })

  it('produces a null-named, zero-duration record for a flag-only marker', () => {
    const committed = commitSchedule(
      { id: null, activity: null, startMinutes: 90, durationMinutes: 0 },
      { flags: ['Attack'] },
    )
    expect(committed.name).toBeNull()
    expect(committed.durationMinutes).toBe(0)
    expect(committed.flags).toEqual(['Attack'])
  })
})

describe('the stepper increment', () => {
  it('is a real, positive number of minutes, never a 15-minute-locked step', () => {
    expect(DURATION_STEP_MINUTES).toBeGreaterThan(0)
  })
})

/* ---------------------------------------------------------------------------
 * Duration drag-block (Modal Redesign §C) — moving the whole pill and
 * resizing from its start edge. Same rule 1 as everywhere else in this file,
 * just phrased as a two-edge range instead of "duration from a fixed start".
 * ------------------------------------------------------------------------- */
describe('moveBounds / clampMove', () => {
  it('spans the whole day when nothing else is scheduled', () => {
    expect(moveBounds([], 600, 30)).toEqual({ min: 0, max: MINUTES_PER_DAY - 30 })
  })

  it('is bounded below by the end of the immediately preceding activity', () => {
    const existing = [make(540, 30)] // 9:00-9:30
    expect(moveBounds(existing, 600, 30)).toEqual({ min: 570, max: MINUTES_PER_DAY - 30 })
  })

  it('is bounded above by the start of the immediately following activity, minus duration', () => {
    const existing = [make(660, 30)] // 11:00-11:30
    expect(moveBounds(existing, 600, 30)).toEqual({ min: 0, max: 630 })
  })

  it('is bounded on both sides at once — the exact gap the block currently sits in', () => {
    const existing = [make(540, 30), make(660, 30)] // 9:00-9:30, 11:00-11:30
    expect(moveBounds(existing, 600, 30)).toEqual({ min: 570, max: 630 })
  })

  it('excludes the block being moved from its own bounds', () => {
    const self = make(600, 30, { id: 'self' })
    expect(moveBounds([self], 600, 30, 'self')).toEqual({ min: 0, max: MINUTES_PER_DAY - 30 })
  })

  it('a flag marker (zero duration) never constrains the range', () => {
    const marker = make(600, 0, { name: null })
    expect(moveBounds([marker], 300, 30)).toEqual({ min: 0, max: MINUTES_PER_DAY - 30 })
  })

  it('clampMove hard-stops at the boundary rather than jumping past it', () => {
    const existing = [make(660, 30)] // 11:00-11:30
    expect(clampMove(existing, 600, 30, 615)).toBe(615) // still inside, unaffected
    expect(clampMove(existing, 600, 30, 700)).toBe(630) // clamped to the max
    expect(clampMove(existing, 600, 30, -50)).toBe(0) // clamped to the day start
  })
})

describe('resizeStartBounds / clampResizeStart', () => {
  it('the end stays put — bounded above by end minus the 1-minute floor', () => {
    expect(resizeStartBounds([], 600, 630)).toEqual({ min: 0, max: 629 })
  })

  it('is bounded below by the end of the preceding activity', () => {
    const existing = [make(540, 30)] // 9:00-9:30
    expect(resizeStartBounds(existing, 600, 630)).toEqual({ min: 570, max: 629 })
  })

  it('excludes the block being resized from its own bounds', () => {
    const self = make(600, 30, { id: 'self' })
    expect(resizeStartBounds([self], 600, 630, 'self')).toEqual({ min: 0, max: 629 })
  })

  it('clampResizeStart hard-stops rather than shrinking to nothing or past a neighbour', () => {
    const existing = [make(540, 30)] // 9:00-9:30
    expect(clampResizeStart(existing, 600, 630, 560)).toBe(570) // clamped to the neighbour's end
    expect(clampResizeStart(existing, 600, 630, 640)).toBe(629) // clamped to end - 1
  })
})
