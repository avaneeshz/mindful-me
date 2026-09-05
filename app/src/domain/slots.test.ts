import { describe, expect, it } from 'vitest'
import {
  DAY_ROW_START_SLOT,
  NIGHT_ROW_START_SLOT,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  SLOTS_PER_ROW,
  activitiesTouchingSlot,
  activityRowSegments,
  countMarkedSlots,
  dayRowSlotIndices,
  flagMarkerAt,
  formatActivityRange,
  formatHourTickLabel,
  formatMinutes,
  formatSlotRange,
  minutesInSlot,
  nightRowSlotIndices,
  nowMarker,
  periodOfSlot,
  positionInRow,
  rowActivitySegments,
  rowHourTickLabels,
  tickLabelPositions,
  slotIndexFromDate,
  slotIndexFromMinutes,
  slotMinuteRange,
  startsInSlot,
} from './slots'
import type { ActivityList, ScheduledActivity } from './types'

let id = 0
function activity(startMinutes: number, durationMinutes: number, name = 'Homework'): ScheduledActivity {
  id += 1
  return {
    id: `a${id}`,
    name,
    path: [],
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [], symptoms: [], notes: null,
    status: 'planned',
    timezone: 'UTC',
  }
}

function marker(startMinutes: number, flags: ScheduledActivity['flags']): ScheduledActivity {
  id += 1
  return {
    id: `m${id}`,
    name: null,
    path: [],
    startMinutes,
    durationMinutes: 0,
    flags,
    quality: [], symptoms: [], notes: null,
    status: 'planned',
    timezone: 'UTC',
  }
}

/* ------------------------------------------------------------------ *
 * Day / Night row index remapping — the piece most likely to be got wrong.
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
    expect(dayRowSlotIndices()).toEqual(Array.from({ length: 24 }, (_, i) => 12 + i))
  })

  it('stitches the night row across midnight: 36..47 then 0..11', () => {
    const night = nightRowSlotIndices()
    expect(night.slice(0, 12)).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47])
    expect(night.slice(12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
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
  })
})

/* ------------------------------------------------------------------ *
 * Real device time -> slot index.
 * ------------------------------------------------------------------ */

describe('current time to slot index', () => {
  it('derives the slot from minutes since midnight', () => {
    expect(slotIndexFromMinutes(0)).toBe(0)
    expect(slotIndexFromMinutes(29)).toBe(0)
    expect(slotIndexFromMinutes(30)).toBe(1)
    expect(slotIndexFromMinutes(16 * 60)).toBe(32)
    expect(slotIndexFromMinutes(23 * 60 + 59)).toBe(47)
  })

  it('derives the slot from a real Date', () => {
    expect(slotIndexFromDate(new Date(2026, 7, 25, 16, 0))).toBe(32)
    expect(slotIndexFromDate(new Date(2026, 7, 25, 0, 15))).toBe(0)
    expect(slotIndexFromDate(new Date(2026, 7, 25, 6, 0))).toBe(12)
    expect(slotIndexFromDate(new Date(2026, 7, 25, 23, 45))).toBe(47)
  })
})

describe('current-time marker placement', () => {
  const at = (h: number, m = 0) => nowMarker(new Date(2026, 7, 25, h, m))

  it('puts the marker on the day row between 6am and 6pm', () => {
    expect(at(6, 0)).toEqual({ period: 'day', ratio: 0 })
    expect(at(12, 0)).toEqual({ period: 'day', ratio: 0.5 })
  })

  it('puts the marker on the night row otherwise, with midnight at the midpoint', () => {
    expect(at(18, 0)).toEqual({ period: 'night', ratio: 0 })
    expect(at(0, 0)).toEqual({ period: 'night', ratio: 0.5 })
  })

  it('agrees with the period of the slot containing now', () => {
    for (let minutes = 0; minutes < 1440; minutes += 7) {
      const date = new Date(2026, 7, 25, 0, minutes)
      expect(nowMarker(date).period).toBe(periodOfSlot(slotIndexFromDate(date)))
    }
  })
})

/* ------------------------------------------------------------------ *
 * Grid <-> real-activity relationship: no more capacity rule, no more
 * spillover bookkeeping — any number of non-overlapping real activities may
 * touch the same grid cell.
 * ------------------------------------------------------------------ */

describe('activitiesTouchingSlot', () => {
  it('finds an activity anchored exactly within the slot', () => {
    const acts: ActivityList = [activity(600, 30)] // slot 20 (10:00-10:30)
    expect(activitiesTouchingSlot(acts, 20)).toHaveLength(1)
    expect(activitiesTouchingSlot(acts, 21)).toHaveLength(0)
  })

  it('finds an activity anchored earlier that merely continues through the slot', () => {
    const acts: ActivityList = [activity(600, 60)] // 10:00-11:00, spans slots 20 and 21
    expect(activitiesTouchingSlot(acts, 21)).toHaveLength(1)
    expect(activitiesTouchingSlot(acts, 22)).toHaveLength(0)
  })

  it('finds more than one non-overlapping activity in the same 30-minute cell — no 2-activity cap', () => {
    const acts: ActivityList = [activity(600, 10, 'A'), activity(610, 10, 'B'), activity(620, 10, 'C')]
    expect(activitiesTouchingSlot(acts, 20)).toHaveLength(3)
  })

  it('excludes flag markers (zero duration) entirely', () => {
    const acts: ActivityList = [marker(600, ['Fear response'])]
    expect(activitiesTouchingSlot(acts, 20)).toHaveLength(0)
  })
})

describe('minutesInSlot / startsInSlot', () => {
  it('reports the full duration when the activity fits inside one cell', () => {
    const a = activity(600, 15)
    expect(minutesInSlot(a, 20)).toBe(15)
    expect(startsInSlot(a, 20)).toBe(true)
  })

  it('clips a spanning activity to each cell’s own real share', () => {
    const a = activity(600, 75) // 10:00-11:15: slot 20 (30), slot 21 (30), slot 22 (15)
    expect(minutesInSlot(a, 20)).toBe(30)
    expect(minutesInSlot(a, 21)).toBe(30)
    expect(minutesInSlot(a, 22)).toBe(15)
    expect(minutesInSlot(a, 23)).toBe(0)
    expect(startsInSlot(a, 20)).toBe(true)
    expect(startsInSlot(a, 21)).toBe(false)
    expect(startsInSlot(a, 22)).toBe(false)
  })
})

describe('flagMarkerAt', () => {
  it('finds the marker anchored exactly at the slot start', () => {
    const acts: ActivityList = [marker(600, ['Trauma response'])]
    expect(flagMarkerAt(acts, 20)?.flags).toEqual(['Trauma response'])
    expect(flagMarkerAt(acts, 21)).toBeUndefined()
  })

  it('is independent of whatever real activity also touches the slot', () => {
    const acts: ActivityList = [activity(600, 30), marker(600, ['Stress response'])]
    expect(flagMarkerAt(acts, 20)?.flags).toEqual(['Stress response'])
    expect(activitiesTouchingSlot(acts, 20)).toHaveLength(1)
  })
})

describe('countMarkedSlots', () => {
  it('counts only grid cells touched by a real activity, not flag-only ones', () => {
    const acts: ActivityList = [
      activity(90, 30), // slot 3
      marker(120, ['Stress response']), // slot 4, flagged but unmarked
      activity(150, 60), // slots 5 and 6
    ]
    expect(countMarkedSlots(acts)).toBe(3)
    expect(countMarkedSlots([])).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * Timeline strip geometry — generalized from slot-index anchoring to real
 * minutes. Since activities may never overlap, there is no more need for a
 * "leadingOffsetMinutes" nudge: every segment simply occupies its own real,
 * non-overlapping minute range.
 * ------------------------------------------------------------------ */

describe('activityRowSegments', () => {
  it('keeps a long Day activity as one continuous span', () => {
    expect(activityRowSegments(8 * 60, 120, 'day')).toEqual([{ startPosition: 4, minutes: 120 }])
  })

  it('splits an activity at the row edge while preserving both pieces', () => {
    // 17:00 (1020) for 240 minutes reaches into the Night row at 21:00 (1260).
    expect(activityRowSegments(1020, 240, 'day')).toEqual([{ startPosition: 22, minutes: 60 }])
    expect(activityRowSegments(1020, 240, 'night')).toEqual([{ startPosition: 0, minutes: 180 }])
  })

  it('supports a fractional start position for a duration off the 30-minute grid', () => {
    // 10:10 for 20 minutes: 10 minutes into slot 20 (position 8), i.e. 8.33 cells in.
    const [segment] = activityRowSegments(610, 20, 'day')
    expect(segment.startPosition).toBeCloseTo(8 + 10 / 30, 10)
    expect(segment.minutes).toBe(20)
  })

  it('clips an activity that would otherwise run past the visible 24-hour board', () => {
    // 23:45 (1425) for 60 minutes: only 15 minutes remain before the board's
    // end (midnight) — which sits at the Night row's own midpoint (position 12).
    const segments = activityRowSegments(1425, 60, 'night')
    expect(segments).toEqual([{ startPosition: 11.5, minutes: 15 }])
    expect(segments[0].startPosition + segments[0].minutes / SLOT_MINUTES).toBe(SLOTS_PER_ROW / 2)
  })

  it('returns nothing for an activity entirely outside the requested row', () => {
    expect(activityRowSegments(8 * 60, 60, 'night')).toEqual([])
  })
})

describe('rowActivitySegments', () => {
  it('never overlaps two segments in the same row — the model guarantees non-overlapping activities', () => {
    const acts: ActivityList = [activity(600, 30, 'A'), activity(630, 45, 'B')]
    const segments = rowActivitySegments(acts, 'day')
    expect(segments).toHaveLength(2)
    const [a, b] = segments.sort((x, y) => x.startPosition - y.startPosition)
    expect(a.startPosition + a.minutes / SLOT_MINUTES).toBeLessThanOrEqual(b.startPosition)
  })

  it('never renders a segment for a flag-only marker', () => {
    const acts: ActivityList = [marker(600, ['Fear response'])]
    expect(rowActivitySegments(acts, 'day')).toEqual([])
  })

  it('carries the real activity object through for colour/label lookups', () => {
    const a = activity(600, 30, 'Homework')
    const [segment] = rowActivitySegments([a], 'day')
    expect(segment.activity).toBe(a)
  })
})

/* ------------------------------------------------------------------ *
 * Time formatting.
 * ------------------------------------------------------------------ */

describe('time formatting', () => {
  it('renders 24-hour grid-cell ranges', () => {
    expect(formatSlotRange(0)).toBe('00:00 – 00:30')
    expect(formatSlotRange(23)).toBe('11:30 – 12:00')
    expect(formatSlotRange(32)).toBe('16:00 – 16:30')
    expect(formatSlotRange(47)).toBe('23:30 – 00:00')
  })

  it('formats a real activity’s own arbitrary-minute range', () => {
    expect(formatActivityRange(600, 45)).toBe('10:00 – 10:45')
  })

  it('wraps real minutes for display when an activity’s tail crosses midnight', () => {
    expect(formatMinutes(1440)).toBe('00:00')
    expect(formatMinutes(1500)).toBe('01:00')
  })

  it('returns the correct minute range for a grid cell', () => {
    expect(slotMinuteRange(20)).toEqual({ start: 600, end: 630 })
  })
})

describe('hour tick ruler', () => {
  it('labels every hour across the row — 13 points, first and last only carrying an AM/PM suffix', () => {
    expect(rowHourTickLabels('day')).toEqual([
      '6AM', '7', '8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6PM',
    ])
    expect(rowHourTickLabels('night')).toEqual([
      '6PM', '7', '8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6AM',
    ])
  })

  it('formats both noon and midnight as 12, never 0, only at an edge', () => {
    expect(formatHourTickLabel(0, { first: true })).toBe('12AM')
    expect(formatHourTickLabel(12, { last: true })).toBe('12PM')
    expect(formatHourTickLabel(23, { last: true })).toBe('11PM')
  })

  it('drops the AM/PM suffix for every label that is not a row edge', () => {
    expect(formatHourTickLabel(0, {})).toBe('12')
    expect(formatHourTickLabel(13, {})).toBe('1')
    expect(formatHourTickLabel(19, {})).toBe('7')
  })

  it('places 13 labels at even 1/12 steps, from 0% to 100%', () => {
    const positions = tickLabelPositions()
    expect(positions).toHaveLength(13)
    expect(positions[0]).toBe(0)
    expect(positions[12]).toBe(100)
    expect(positions[6]).toBeCloseTo(50, 5)
    // Strictly increasing — no two labels land on the same x position.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
  })

  it('day and night rows never share the same 13-label set (they cover different hours)', () => {
    expect(rowHourTickLabels('day')).not.toEqual(rowHourTickLabels('night'))
  })
})
