import type { ActivityList, Period, ScheduledActivity } from './types'

/* ------------------------------------------------------------------ *
 * The 30-minute GRID is a rendering concern only — never stored (Target
 * Architecture). These constants and the functions below describe the
 * Timeline's visual grid: which of the 48 half-hour cells is which, which
 * row it belongs to, and where a real activity's [start, start+duration)
 * span lands on that grid. None of this is persisted; `domain/scheduling.ts`
 * is where the real placement rules (no overlap, the continuous-block
 * ceiling) live, over real minutes, independent of this grid entirely.
 * ------------------------------------------------------------------ */

/** 48 grid cells per day, one per 30 minutes, indexed from midnight. */
export const SLOTS_PER_DAY = 48
export const SLOT_MINUTES = 30

/* ------------------------------------------------------------------ *
 * Day / Night row index remapping.
 *
 * The underlying grid is ONE array indexed 0..47 from midnight
 * (cell i covers i*30 .. i*30+30 minutes after 00:00).
 *
 * The Day row (6a -> 6p) is indices 12..35 and IS contiguous.
 * The Night row (6p -> 6a) is NOT contiguous: it is 36..47 (6pm..midnight)
 * followed by 0..11 (midnight..6am), stitched so the row reads
 * chronologically left to right.
 * ------------------------------------------------------------------ */

export const SLOTS_PER_ROW = 24
/** 06:00 — first cell of the Day row. */
export const DAY_ROW_START_SLOT = 12
/** 18:00 — first cell of the Night row. */
export const NIGHT_ROW_START_SLOT = 36

/** Grid cell indices of the Day row, chronological left-to-right: [12..35]. */
export function dayRowSlotIndices(): number[] {
  return Array.from({ length: SLOTS_PER_ROW }, (_, i) => DAY_ROW_START_SLOT + i)
}

/** Grid cell indices of the Night row, chronological left-to-right: [36..47, 0..11]. */
export function nightRowSlotIndices(): number[] {
  return Array.from(
    { length: SLOTS_PER_ROW },
    (_, i) => (NIGHT_ROW_START_SLOT + i) % SLOTS_PER_DAY,
  )
}

export function rowSlotIndices(period: Period): number[] {
  return period === 'day' ? dayRowSlotIndices() : nightRowSlotIndices()
}

/** Which row a given 0–47 grid cell belongs to. */
export function periodOfSlot(slot: number): Period {
  const s = normalizeSlot(slot)
  return s >= DAY_ROW_START_SLOT && s < NIGHT_ROW_START_SLOT ? 'day' : 'night'
}

/** Column position 0..23 of a grid cell within its own row. */
export function positionInRow(slot: number): number {
  const s = normalizeSlot(slot)
  const rowStart = periodOfSlot(s) === 'day' ? DAY_ROW_START_SLOT : NIGHT_ROW_START_SLOT
  return (s - rowStart + SLOTS_PER_DAY) % SLOTS_PER_DAY
}

/** The Night row's midnight tick sits between position 11 and 12 (its midpoint). */
export const MIDNIGHT_TICK_POSITION = SLOTS_PER_ROW / 2

/* ------------------------------------------------------------------ *
 * Hour tick labels beneath each row — every hour, not just start/midpoint/
 * end (a later, confirmed revision of the original 3-label ruler): 13
 * labels, one per hour boundary across the row's 12 hours.
 *   day   -> 6AM  7  8  9  10  11  12  1  2  3  4  5  6PM
 *   night -> 6PM  7  8  9  10  11  12  1  2  3  4  5  6AM
 * AM/PM suffix appears ONLY on the first and last label of each row; every
 * label in between is a bare number — exactly the artifact's own format.
 * ------------------------------------------------------------------ */

/** One row spans exactly 12 hours -> 13 hour-boundary ticks (0..12 inclusive). */
export const TICKS_PER_ROW = SLOTS_PER_ROW / 2 + 1

/** e.g. (0, {first:true}) -> "12AM", (13, {}) -> "1", (18, {last:true}) -> "6PM". */
export function formatHourTickLabel(hour24: number, edge: { first?: boolean; last?: boolean }): string {
  const h = ((hour24 % 24) + 24) % 24
  const h12 = h % 12 === 0 ? 12 : h % 12
  if (!edge.first && !edge.last) return String(h12)
  const suffix = h < 12 ? 'AM' : 'PM'
  return `${h12}${suffix}`
}

/**
 * The 13 tick labels for a row, left to right, one per hour boundary. Pair
 * with `tickLabelPositions` for each label's `left%` — evenly spaced in
 * TIME (every row spans a fixed 12 real hours), but never assume evenly
 * spaced in PIXELS: label text width varies ("6AM" vs "7"), so only an
 * explicit `left%` — never flexbox `justify-between` — places each one
 * where it actually belongs.
 */
export function rowHourTickLabels(period: Period): string[] {
  const startSlot = period === 'day' ? DAY_ROW_START_SLOT : NIGHT_ROW_START_SLOT
  const startHour = startSlot / 2
  return Array.from({ length: TICKS_PER_ROW }, (_, i) =>
    formatHourTickLabel(startHour + i, { first: i === 0, last: i === TICKS_PER_ROW - 1 }),
  )
}

/** The `left%` position for each of `rowHourTickLabels`'s 13 labels, in the same order. */
export function tickLabelPositions(): number[] {
  return Array.from({ length: TICKS_PER_ROW }, (_, i) => (i / (TICKS_PER_ROW - 1)) * 100)
}

export function normalizeSlot(slot: number): number {
  return ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY
}

/* ------------------------------------------------------------------ *
 * Real device time -> slot index / minutes.
 * ------------------------------------------------------------------ */

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function slotIndexFromMinutes(minutes: number): number {
  const m = ((minutes % 1440) + 1440) % 1440
  return Math.floor(m / SLOT_MINUTES)
}

export function slotIndexFromDate(date: Date): number {
  return slotIndexFromMinutes(minutesSinceMidnight(date))
}

/** The grid cell's own [start, end) real-minute range. */
export function slotMinuteRange(slot: number): { start: number; end: number } {
  const start = normalizeSlot(slot) * SLOT_MINUTES
  return { start, end: start + SLOT_MINUTES }
}

/**
 * Where the single current-time marker goes: which row, and how far across it
 * (0 = row start, 1 = row end). Exactly one row ever carries a marker.
 */
export function nowMarker(date: Date): { period: Period; ratio: number } {
  const m = minutesSinceMidnight(date)
  const dayStart = DAY_ROW_START_SLOT * SLOT_MINUTES // 360
  const nightStart = NIGHT_ROW_START_SLOT * SLOT_MINUTES // 1080
  const rowMinutes = SLOTS_PER_ROW * SLOT_MINUTES // 720

  if (m >= dayStart && m < nightStart) {
    return { period: 'day', ratio: (m - dayStart) / rowMinutes }
  }
  const offset = (((m - nightStart) % 1440) + 1440) % 1440
  return { period: 'night', ratio: offset / rowMinutes }
}

/* ------------------------------------------------------------------ *
 * Time formatting.
 * ------------------------------------------------------------------ */

function formatClock(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** e.g. "16:00" for real, arbitrary minutes (wraps past midnight for display). */
export function formatMinutes(minutes: number): string {
  return formatClock(minutes)
}

/** e.g. "16:00 – 16:30" for a grid cell. */
export function formatSlotRange(slot: number): string {
  const start = normalizeSlot(slot) * SLOT_MINUTES
  return `${formatClock(start)} – ${formatClock(start + SLOT_MINUTES)}`
}

/** e.g. "16:00" */
export function formatSlotStart(slot: number): string {
  return formatClock(normalizeSlot(slot) * SLOT_MINUTES)
}

/** e.g. "16:00 – 16:45" for a real activity's own start/duration. */
export function formatActivityRange(startMinutes: number, durationMinutes: number): string {
  return `${formatClock(startMinutes)} – ${formatClock(startMinutes + durationMinutes)}`
}

/* ------------------------------------------------------------------ *
 * Grid <-> real-activity relationship. There is no more capacity rule and
 * no more "spillover" bookkeeping — an activity simply has a real start
 * time and duration, and any number of activities may touch the same
 * 30-minute grid cell as long as none of them overlap each other in real
 * time (enforced by `domain/scheduling.ts`, never here).
 * ------------------------------------------------------------------ */

function isReal(a: ScheduledActivity): boolean {
  return a.durationMinutes > 0
}

/** Real activities (flag markers excluded) whose time range overlaps this grid cell. */
export function activitiesTouchingSlot(activities: ActivityList, slot: number): ScheduledActivity[] {
  const { start, end } = slotMinuteRange(slot)
  return activities.filter(
    (a) => isReal(a) && a.startMinutes < end && a.startMinutes + a.durationMinutes > start,
  )
}

/** Minutes of `slot`'s own 30-minute window actually covered by `activity`. */
export function minutesInSlot(activity: ScheduledActivity, slot: number): number {
  const { start, end } = slotMinuteRange(slot)
  const overlapStart = Math.max(start, activity.startMinutes)
  const overlapEnd = Math.min(end, activity.startMinutes + activity.durationMinutes)
  return Math.max(0, overlapEnd - overlapStart)
}

/** True when `activity` visually STARTS within this grid cell (vs. merely continuing through it). */
export function startsInSlot(activity: ScheduledActivity, slot: number): boolean {
  const { start, end } = slotMinuteRange(slot)
  return activity.startMinutes >= start && activity.startMinutes < end
}

/**
 * The zero-duration, name-less marker (if any) carrying this grid cell's
 * flags — the real-model equivalent of the old "whole-slot marker": no
 * duration, no schedule cost, independent of any real activity.
 */
export function flagMarkerAt(activities: ActivityList, slot: number): ScheduledActivity | undefined {
  const { start } = slotMinuteRange(slot)
  return activities.find((a) => a.name === null && a.durationMinutes === 0 && a.startMinutes === start)
}

/** Number of the 48 grid cells touched by at least one real activity. */
export function countMarkedSlots(activities: ActivityList): number {
  let count = 0
  for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
    if (activitiesTouchingSlot(activities, slot).length > 0) count += 1
  }
  return count
}

/* ------------------------------------------------------------------ *
 * Timeline strip geometry — one positioned, colourable piece per activity
 * per row. Generalized from the old slot-anchored walk to real minutes:
 * since activities can never overlap (rule 1), there is no more need for
 * the old "leadingOffsetMinutes" nudge that kept a spillover's tail from
 * painting under the next anchor's own segment — every segment now simply
 * occupies its own real, non-overlapping minute range.
 * ------------------------------------------------------------------ */

/** One absolute-minute row-local range: `rowStart..rowStart+len` maps to `absStart..absStart+len`. */
interface RowPiece {
  absStart: number
  absEnd: number
  /** This piece's own offset (in minutes) from the row's left edge. */
  rowStart: number
}

function rowPieces(period: Period): RowPiece[] {
  if (period === 'day') {
    return [{ absStart: DAY_ROW_START_SLOT * SLOT_MINUTES, absEnd: NIGHT_ROW_START_SLOT * SLOT_MINUTES, rowStart: 0 }]
  }
  const eveningLength = 1440 - NIGHT_ROW_START_SLOT * SLOT_MINUTES // 18:00 -> midnight
  return [
    { absStart: NIGHT_ROW_START_SLOT * SLOT_MINUTES, absEnd: 1440, rowStart: 0 },
    { absStart: 0, absEnd: DAY_ROW_START_SLOT * SLOT_MINUTES, rowStart: eveningLength },
  ]
}

/**
 * Visible piece(s) of one activity's real [start, start+duration) span within
 * a Day or Night row, clipped to the visible 24-hour board. `startPosition`
 * is in grid-cell units (may be fractional, since durations are no longer
 * stepped) and `minutes` is the real span this piece covers.
 */
export function activityRowSegments(
  startMinutes: number,
  durationMinutes: number,
  period: Period,
): Array<{ startPosition: number; minutes: number }> {
  const activityStart = startMinutes
  const activityEnd = Math.min(startMinutes + durationMinutes, 1440)
  if (activityEnd <= activityStart) return []

  const segments: Array<{ startPosition: number; minutes: number }> = []
  for (const piece of rowPieces(period)) {
    const overlapStart = Math.max(activityStart, piece.absStart)
    const overlapEnd = Math.min(activityEnd, piece.absEnd)
    if (overlapEnd <= overlapStart) continue
    const rowLocalStart = piece.rowStart + (overlapStart - piece.absStart)
    segments.push({ startPosition: rowLocalStart / SLOT_MINUTES, minutes: overlapEnd - overlapStart })
  }
  return segments
}

/** One positioned, colourable piece of the timeline strip for a row. */
export interface RowActivitySegment {
  activity: ScheduledActivity
  /** Column position (may be fractional) where this piece starts. */
  startPosition: number
  /** Minutes this piece spans. */
  minutes: number
}

/**
 * All positioned segments for a Day or Night row — the timeline strip's one
 * geometry source, kept separate from the pixel/percent conversion
 * (`left`/`width` styles) so it can be tested without a DOM. Flag markers
 * (zero duration) never render a strip segment.
 */
export function rowActivitySegments(activities: ActivityList, period: Period): RowActivitySegment[] {
  const result: RowActivitySegment[] = []
  for (const activity of activities) {
    if (!isReal(activity)) continue
    for (const segment of activityRowSegments(activity.startMinutes, activity.durationMinutes, period)) {
      result.push({ activity, startPosition: segment.startPosition, minutes: segment.minutes })
    }
  }
  return result
}
