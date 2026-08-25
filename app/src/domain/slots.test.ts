import { describe, expect, it } from 'vitest'
import {
  DAY_ROW_START_SLOT,
  MIN_DURATION,
  NIGHT_ROW_START_SLOT,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  SLOTS_PER_ROW,
  activityAtSlot,
  clampDuration,
  countMarkedSlots,
  dayRowSlotIndices,
  defaultDurationFor,
  activityRowSegments,
  formatHourTick,
  formatSlotRange,
  isSlotFull,
  isSlotFullAt,
  maxDurationFor,
  maxScheduleDuration,
  nightRowSlotIndices,
  nowMarker,
  periodOfSlot,
  positionInRow,
  remainingMinutes,
  remainingMinutesAt,
  rowActivitySegments,
  rowTickLabels,
  slotIndexFromDate,
  slotIndexFromMinutes,
  spilloverActivity,
  spilloverMinutes,
  usedMinutes,
} from './slots'
import type { SlotEntries, SlotEntry } from './types'

const entry = (...durations: number[]): SlotEntry => ({
  activities: durations.map((duration, i) => ({
    name: `Activity ${i}`,
    path: [],
    duration,
  })),
  flags: [],
})

/* ------------------------------------------------------------------ *
 * Day / Night index remapping — the piece most likely to be got wrong.
 * ------------------------------------------------------------------ */

describe('day/night row index remapping', () => {
  it('puts 24 slots on each row and covers all 48 exactly once', () => {
    const day = dayRowSlotIndices()
    const night = nightRowSlotIndices()

    expect(day).toHaveLength(SLOTS_PER_ROW)
    expect(night).toHaveLength(SLOTS_PER_ROW)
    expect(new Set([...day, ...night]).size).toBe(SLOTS_PER_DAY)
  })

  it('makes the day row the contiguous run 12..35 (6am to 6pm)', () => {
    expect(dayRowSlotIndices()[0]).toBe(DAY_ROW_START_SLOT)
    expect(dayRowSlotIndices().at(-1)).toBe(NIGHT_ROW_START_SLOT - 1)
    expect(dayRowSlotIndices()).toEqual(
      Array.from({ length: 24 }, (_, i) => 12 + i),
    )
  })

  it('stitches the night row across midnight: 36..47 then 0..11', () => {
    const night = nightRowSlotIndices()
    expect(night.slice(0, 12)).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47])
    expect(night.slice(12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('is NOT a naive half-split of the 0..47 array', () => {
    // A naive split would start the "first" row at slot 0 (midnight), producing
    // a noon/midnight division instead of the 6a/6p one the design requires.
    const naiveFirstHalf = Array.from({ length: 24 }, (_, i) => i)
    expect(dayRowSlotIndices()).not.toEqual(naiveFirstHalf)
    expect(nightRowSlotIndices()).not.toEqual(naiveFirstHalf)
  })

  it('places midnight at the exact midpoint of the night row', () => {
    expect(nightRowSlotIndices()[SLOTS_PER_ROW / 2]).toBe(0)
  })

  it('assigns each slot to the correct period', () => {
    expect(periodOfSlot(11)).toBe('night') // 05:30
    expect(periodOfSlot(12)).toBe('day') // 06:00
    expect(periodOfSlot(35)).toBe('day') // 17:30
    expect(periodOfSlot(36)).toBe('night') // 18:00
    expect(periodOfSlot(0)).toBe('night') // 00:00
    expect(periodOfSlot(47)).toBe('night') // 23:30
  })

  it('reports a slot position that matches its row ordering', () => {
    expect(positionInRow(12)).toBe(0)
    expect(positionInRow(35)).toBe(23)
    expect(positionInRow(36)).toBe(0)
    expect(positionInRow(47)).toBe(11)
    expect(positionInRow(0)).toBe(12)
    expect(positionInRow(11)).toBe(23)

    for (const period of ['day', 'night'] as const) {
      const indices = period === 'day' ? dayRowSlotIndices() : nightRowSlotIndices()
      indices.forEach((slot, index) => expect(positionInRow(slot)).toBe(index))
    }
  })
})

describe('anchored activity row projection', () => {
  it('keeps a long Day activity as one continuous span', () => {
    expect(activityRowSegments(16, 120, 'day')).toEqual([{ startPosition: 4, minutes: 120 }])
  })

  it('splits a Night activity at the row edge while preserving both pieces', () => {
    expect(activityRowSegments(34, 240, 'day')).toEqual([{ startPosition: 22, minutes: 60 }])
    expect(activityRowSegments(34, 240, 'night')).toEqual([{ startPosition: 0, minutes: 180 }])
  })
})

/* ------------------------------------------------------------------ *
 * Bug: the timeline strip positioned every anchor's OWN activities
 * starting at their cell's raw left edge, with no awareness that the cell
 * might already carry spillover from an EARLIER anchor's longer activity.
 * Adding a new activity into a slot's genuine spillover-adjusted leftover
 * minutes (Bug C) rendered it starting at the SAME position as the
 * spillover already occupying the first part of that cell — painting over
 * it and leaving the cell's true second half blank, even though both
 * activities' underlying data was correct.
 * ------------------------------------------------------------------ */
describe('row segment layout accounts for spillover already claiming part of a cell', () => {
  it('nudges a new activity past the spillover already claiming the front of its cell', () => {
    // 45-minute activity anchored at 20: fills 20 entirely, spills 15 min
    // into 21. A different 15-minute activity is then anchored AT 21,
    // filling the genuine remainder — exactly the Bug C leftover-capacity
    // case, now rendered.
    const entries: SlotEntries = {
      20: { activities: [{ name: 'Homework', path: [], duration: 45 }], flags: [] },
      21: { activities: [{ name: 'Errand time', path: [], duration: 15 }], flags: [] },
    }
    const segments = rowActivitySegments(entries, 'day')

    const homework = segments.find((s) => s.anchorSlot === 20)!
    const errand = segments.find((s) => s.anchorSlot === 21)!

    // Homework's own cell (20) carries no incoming spillover — unaffected.
    expect(homework.leadingOffsetMinutes).toBe(0)
    expect(homework.startPosition).toBe(errand.startPosition - 1)
    expect(homework.minutes).toBe(45)

    // Errand time is nudged 15 minutes (half a cell) into ITS cell (21) —
    // exactly past Homework's spillover — instead of starting at the raw
    // left edge where Homework's tail already renders.
    expect(errand.leadingOffsetMinutes).toBe(15)
    expect(errand.minutes).toBe(15)

    // The two pieces are contiguous, not overlapping and not gapped: one
    // ends exactly where the other begins, in cell-fraction terms.
    const homeworkEndInCells = homework.startPosition + homework.minutes / SLOT_MINUTES
    const errandStartInCells = errand.startPosition + errand.leadingOffsetMinutes / SLOT_MINUTES
    expect(errandStartInCells).toBeCloseTo(homeworkEndInCells, 10)
    const errandEndInCells = errandStartInCells + errand.minutes / SLOT_MINUTES
    expect(errandEndInCells).toBeCloseTo(errand.startPosition + 1, 10) // fills exactly to the cell's right edge
  })

  it('leaves an ordinary (non-spillover-affected) slot exactly as before', () => {
    const entries: SlotEntries = {
      15: { activities: [{ name: 'Homework', path: [], duration: 15 }], flags: [] },
    }
    const [segment] = rowActivitySegments(entries, 'day')
    expect(segment.leadingOffsetMinutes).toBe(0)
    expect(segment.startPosition).toBe(activityRowSegments(15, 15, 'day')[0].startPosition)
  })

  it('renders a slot that is ONLY spillover (no room for anything else) with no extra segment for it', () => {
    // 60-minute activity: fully consumes the next slot, leaving it with no
    // activities of its own — only Homework's own (unaffected) segment.
    const entries: SlotEntries = {
      20: { activities: [{ name: 'Homework', path: [], duration: 60 }], flags: [] },
    }
    const segments = rowActivitySegments(entries, 'day')
    expect(segments).toHaveLength(1)
    expect(segments[0].anchorSlot).toBe(20)
    expect(segments[0].minutes).toBe(60)
  })

  it('generalizes to a 3-slot span with a trailing activity in the genuine leftover', () => {
    // 75-minute activity anchored at 20 (10:00): fills 20 and 21 fully,
    // spills 15 min into 22, leaving 22 with 15 genuine free minutes for a
    // different activity.
    const entries: SlotEntries = {
      20: { activities: [{ name: 'Deep work', path: [], duration: 75 }], flags: [] },
      22: { activities: [{ name: 'Errand time', path: [], duration: 15 }], flags: [] },
    }
    const segments = rowActivitySegments(entries, 'day')
    const deepWork = segments.find((s) => s.anchorSlot === 20)!
    const errand = segments.find((s) => s.anchorSlot === 22)!

    expect(deepWork.leadingOffsetMinutes).toBe(0)
    expect(deepWork.minutes).toBe(75)
    expect(errand.leadingOffsetMinutes).toBe(15)
    expect(errand.minutes).toBe(15)
  })
})

/* ------------------------------------------------------------------ *
 * Real device time -> slot index (the prototype hardcoded NOW_INDEX = 32).
 * ------------------------------------------------------------------ */

describe('current time to slot index', () => {
  it('derives the slot from minutes since midnight', () => {
    expect(slotIndexFromMinutes(0)).toBe(0)
    expect(slotIndexFromMinutes(29)).toBe(0)
    expect(slotIndexFromMinutes(30)).toBe(1)
    expect(slotIndexFromMinutes(59)).toBe(1)
    expect(slotIndexFromMinutes(16 * 60)).toBe(32) // the old hardcoded value
    expect(slotIndexFromMinutes(23 * 60 + 59)).toBe(47)
  })

  it('derives the slot from a real Date', () => {
    expect(slotIndexFromDate(new Date(2026, 7, 25, 16, 0))).toBe(32)
    expect(slotIndexFromDate(new Date(2026, 7, 25, 0, 15))).toBe(0)
    expect(slotIndexFromDate(new Date(2026, 7, 25, 6, 0))).toBe(12)
    expect(slotIndexFromDate(new Date(2026, 7, 25, 23, 45))).toBe(47)
  })

  it('never returns an out-of-range slot', () => {
    for (let minutes = 0; minutes < 1440; minutes += 1) {
      const slot = slotIndexFromMinutes(minutes)
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThan(SLOTS_PER_DAY)
    }
  })
})

describe('current-time marker placement', () => {
  const at = (h: number, m = 0) => nowMarker(new Date(2026, 7, 25, h, m))

  it('puts the marker on the day row between 6am and 6pm', () => {
    expect(at(6, 0)).toEqual({ period: 'day', ratio: 0 })
    expect(at(12, 0)).toEqual({ period: 'day', ratio: 0.5 })
    expect(at(17, 59).period).toBe('day')
    expect(at(17, 59).ratio).toBeCloseTo(719 / 720)
  })

  it('puts the marker on the night row otherwise, with midnight at the midpoint', () => {
    expect(at(18, 0)).toEqual({ period: 'night', ratio: 0 })
    expect(at(0, 0)).toEqual({ period: 'night', ratio: 0.5 })
    expect(at(5, 59).period).toBe('night')
    expect(at(5, 59).ratio).toBeCloseTo(719 / 720)
  })

  it('only ever names one row, and the ratio always stays within it', () => {
    for (let minutes = 0; minutes < 1440; minutes += 1) {
      const { period, ratio } = nowMarker(new Date(2026, 7, 25, 0, minutes))
      expect(period === 'day' || period === 'night').toBe(true)
      expect(ratio).toBeGreaterThanOrEqual(0)
      expect(ratio).toBeLessThan(1)
    }
  })

  it('agrees with the period of the slot containing now', () => {
    for (let minutes = 0; minutes < 1440; minutes += 7) {
      const date = new Date(2026, 7, 25, 0, minutes)
      expect(nowMarker(date).period).toBe(periodOfSlot(slotIndexFromDate(date)))
    }
  })
})

/* ------------------------------------------------------------------ *
 * Capacity: <= 2 activities, <= 30 combined minutes.
 * ------------------------------------------------------------------ */

describe('slot capacity and duration capping', () => {
  it('sums used minutes and reports what is left', () => {
    expect(usedMinutes(entry())).toBe(0)
    expect(usedMinutes(entry(15))).toBe(15)
    expect(usedMinutes(entry(15, 15))).toBe(30)
    expect(remainingMinutes(entry())).toBe(30)
    expect(remainingMinutes(entry(15))).toBe(15)
    expect(remainingMinutes(entry(30))).toBe(0)
  })

  it('excludes the activity being edited from the used total', () => {
    const e = entry(15, 15)
    expect(usedMinutes(e, 0)).toBe(15)
    expect(remainingMinutes(e, 0)).toBe(15)
    expect(remainingMinutes(e, 1)).toBe(15)
  })

  it('treats a slot as full at 2 activities OR at 30 minutes', () => {
    expect(isSlotFull(entry())).toBe(false)
    expect(isSlotFull(entry(15))).toBe(false)
    // Two activities: full on count, even though the minutes also happen to fit.
    expect(isSlotFull(entry(15, 15))).toBe(true)
    // One activity using the whole slot: full on minutes, not on count.
    expect(isSlotFull(entry(30))).toBe(true)
  })

  it('caps the addable duration at the remaining minutes', () => {
    expect(maxDurationFor(entry())).toBe(30)
    expect(maxDurationFor(entry(15))).toBe(15)
    expect(maxDurationFor(entry(30))).toBe(0)
  })

  it('refuses a third activity even when minutes would allow it', () => {
    // Never reachable through the UI, but the rule must not depend on that.
    const twoShortActivities: SlotEntry = {
      activities: [
        { name: 'A', path: [], duration: 15 },
        { name: 'B', path: [], duration: 15 },
      ],
      flags: [],
    }
    expect(maxDurationFor(twoShortActivities)).toBe(0)
    expect(isSlotFull(twoShortActivities)).toBe(true)
  })

  it('lets an in-place edit reuse its own minutes without hitting the count limit', () => {
    const e = entry(15, 15)
    // Editing activity 0: 15 min are freed by excluding it, so 15 is the max.
    expect(maxDurationFor(e, 0)).toBe(15)
    // Editing the only activity in a full slot: the whole 30 is available again.
    expect(maxDurationFor(entry(30), 0)).toBe(30)
  })

  it('clamps a desired duration into the legal range', () => {
    expect(clampDuration(30, 30)).toBe(30)
    expect(clampDuration(30, 15)).toBe(15)
    expect(clampDuration(15, 30)).toBe(15)
    expect(clampDuration(0, 30)).toBe(MIN_DURATION)
    expect(clampDuration(45, 30)).toBe(30)
    // No capacity at all means nothing can be placed.
    expect(clampDuration(15, 0)).toBe(0)
  })

  it('snaps to the 15-minute step', () => {
    expect(clampDuration(20, 30)).toBe(15)
    expect(clampDuration(25, 30)).toBe(30)
  })

  it('defaults a placement to whatever is left, up to 30', () => {
    expect(defaultDurationFor(entry())).toBe(30)
    expect(defaultDurationFor(entry(15))).toBe(15)
    expect(defaultDurationFor(entry(30))).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * Bug: a slot only partially covered by spillover from an earlier anchor's
 * longer activity was treated as entirely blocked — not just for the
 * minutes actually spilled into, but for its whole 30 minutes. A 45-minute
 * activity anchored at slot N leaves slot N+1 with 15 genuinely free
 * minutes (spillover only reaches the first 15 of its 30), and those should
 * remain usable; a slot FULLY consumed by spillover (e.g. a 60-minute
 * activity) must still correctly block.
 * ------------------------------------------------------------------ */
describe('spillover into a slot partially covered by an earlier anchor', () => {
  const partiallyCovered: SlotEntries = {
    10: { activities: [{ name: 'Long thing', path: [], duration: 45 }], flags: [] },
  }
  const fullyCovered: SlotEntries = {
    10: { activities: [{ name: 'Longer thing', path: [], duration: 60 }], flags: [] },
  }

  it('reports only the minutes actually spilled into the next slot', () => {
    expect(spilloverMinutes(partiallyCovered, 11)).toBe(15)
    expect(spilloverMinutes(fullyCovered, 11)).toBe(30)
    // The anchor slot itself, and slots two away, see no spillover.
    expect(spilloverMinutes(partiallyCovered, 10)).toBe(0)
    expect(spilloverMinutes(partiallyCovered, 12)).toBe(0)
  })

  it('leaves genuine leftover minutes usable, net of spillover', () => {
    expect(remainingMinutesAt(partiallyCovered, 11)).toBe(15)
    expect(isSlotFullAt(partiallyCovered, 11)).toBe(false)
    expect(maxScheduleDuration(partiallyCovered, 11)).toBe(15)
  })

  it('still blocks a slot that spillover consumes entirely', () => {
    expect(remainingMinutesAt(fullyCovered, 11)).toBe(0)
    expect(isSlotFullAt(fullyCovered, 11)).toBe(true)
    expect(maxScheduleDuration(fullyCovered, 11)).toBe(0)
  })

  it('lets activityAtSlot resolve a slot with BOTH spillover and its own committed activity to its own anchor', () => {
    const ownAndSpillover: SlotEntries = {
      ...partiallyCovered,
      11: { activities: [{ name: 'Own pick', path: [], duration: 15 }], flags: [] },
    }
    expect(activityAtSlot(ownAndSpillover, 11)).toEqual({ startSlot: 11, index: 0 })
    // Once its own capacity is spoken for too, the slot is genuinely full.
    expect(isSlotFullAt(ownAndSpillover, 11)).toBe(true)
  })

  /* ---------------------------------------------------------------------
   * Follow-up: `spilloverActivity` is the read view a slot uses to show its
   * own share of an activity anchored elsewhere (never a duplicate record —
   * Edit/Remove for it still targets `anchorSlot`/`index`). It must attribute
   * the right per-slot share across ANY number of spanned slots, not just a
   * single one-slot-over case.
   * --------------------------------------------------------------------- */
  it('attributes the correct per-slot share across a 3-slot span (90 minutes)', () => {
    const spanning: SlotEntries = {
      10: { activities: [{ name: 'Deep work', path: [], duration: 90 }], flags: [] },
    }
    // The anchor itself has no "spillover" — its own row is clipped to 30
    // separately (see CapacityMeter / SlotActivityList), not via this.
    expect(spilloverActivity(spanning, 10)).toBeNull()

    expect(spilloverActivity(spanning, 11)).toEqual({
      anchorSlot: 10,
      index: 0,
      activity: { name: 'Deep work', path: [], duration: 90 },
      minutesHere: 30,
    })
    expect(spilloverActivity(spanning, 12)).toEqual({
      anchorSlot: 10,
      index: 0,
      activity: { name: 'Deep work', path: [], duration: 90 },
      minutesHere: 30,
    })
    // One slot past the span: no spillover at all.
    expect(spilloverActivity(spanning, 13)).toBeNull()

    // Every spanned slot is genuinely full and independently so.
    expect(isSlotFullAt(spanning, 11)).toBe(true)
    expect(isSlotFullAt(spanning, 12)).toBe(true)
    expect(isSlotFullAt(spanning, 13)).toBe(false)
  })

  it('attributes a partial (15-minute) share, leaving the true remainder free', () => {
    expect(spilloverActivity(partiallyCovered, 11)).toEqual({
      anchorSlot: 10,
      index: 0,
      activity: { name: 'Long thing', path: [], duration: 45 },
      minutesHere: 15,
    })
  })
})

describe('glance caption count', () => {
  it('counts only slots holding at least one activity', () => {
    expect(countMarkedSlots({})).toBe(0)
    expect(
      countMarkedSlots({
        3: entry(30),
        4: { activities: [], flags: ['Stress response'] }, // flagged but unmarked
        5: entry(15, 15),
      }),
    ).toBe(2)
  })
})

describe('slot time formatting', () => {
  it('renders 12-hour ranges with correct meridiems', () => {
    expect(formatSlotRange(0)).toBe('00:00 – 00:30')
    expect(formatSlotRange(23)).toBe('11:30 – 12:00')
    expect(formatSlotRange(32)).toBe('16:00 – 16:30')
    expect(formatSlotRange(47)).toBe('23:30 – 00:00')
  })
})

describe('hour tick ruler', () => {
  it('labels each row edge to edge at 2-hour intervals', () => {
    expect(rowTickLabels('day')).toEqual(['06', '08', '10', '12', '14', '16', '18'])
    expect(rowTickLabels('night')).toEqual(['18', '20', '22', '00', '02', '04', '06'])
  })

  it('puts midnight at the Night row midpoint, where the boundary rule is drawn', () => {
    const night = rowTickLabels('night')
    expect(night[(night.length - 1) / 2]).toBe('00')
  })

  it('formats both noon and midnight as 12, never 0', () => {
    expect(formatHourTick(0)).toBe('12a')
    expect(formatHourTick(12)).toBe('12p')
    expect(formatHourTick(23)).toBe('11p')
  })
})
