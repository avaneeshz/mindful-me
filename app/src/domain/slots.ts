import type { PlacedActivity, Period, SlotEntries, SlotEntry } from './types'

/* ------------------------------------------------------------------ *
 * Slot rules — ported verbatim from the prototype. Do not relax these.
 * ------------------------------------------------------------------ */

/** 48 slots per day, one per 30 minutes, indexed from midnight. */
export const SLOTS_PER_DAY = 48
export const SLOT_MINUTES = 30
export const MAX_ACTIVITIES_PER_SLOT = 2
export const DURATION_STEP = 15
export const MIN_DURATION = 15

/* ------------------------------------------------------------------ *
 * Day / Night row index remapping.
 *
 * The underlying data is ONE array indexed 0..47 from midnight
 * (slot i covers i*30 .. i*30+30 minutes after 00:00).
 *
 * The Day row (6a -> 6p) is indices 12..35 and IS contiguous.
 * The Night row (6p -> 6a) is NOT contiguous: it is 36..47 (6pm..midnight)
 * followed by 0..11 (midnight..6am), stitched so the row reads
 * chronologically left to right.
 *
 * Naively splitting the array in half would produce a noon/midnight split,
 * which is the wrong division entirely.
 * ------------------------------------------------------------------ */

export const SLOTS_PER_ROW = 24
/** 06:00 — first slot of the Day row. */
export const DAY_ROW_START_SLOT = 12
/** 18:00 — first slot of the Night row. */
export const NIGHT_ROW_START_SLOT = 36

/** Slot indices of the Day row, chronological left-to-right: [12..35]. */
export function dayRowSlotIndices(): number[] {
  return Array.from({ length: SLOTS_PER_ROW }, (_, i) => DAY_ROW_START_SLOT + i)
}

/** Slot indices of the Night row, chronological left-to-right: [36..47, 0..11]. */
export function nightRowSlotIndices(): number[] {
  return Array.from(
    { length: SLOTS_PER_ROW },
    (_, i) => (NIGHT_ROW_START_SLOT + i) % SLOTS_PER_DAY,
  )
}

export function rowSlotIndices(period: Period): number[] {
  return period === 'day' ? dayRowSlotIndices() : nightRowSlotIndices()
}

/** Which row a given 0–47 slot index belongs to. */
export function periodOfSlot(slot: number): Period {
  const s = normalizeSlot(slot)
  return s >= DAY_ROW_START_SLOT && s < NIGHT_ROW_START_SLOT ? 'day' : 'night'
}

/** Column position 0..23 of a slot within its own row. */
export function positionInRow(slot: number): number {
  const s = normalizeSlot(slot)
  const rowStart = periodOfSlot(s) === 'day' ? DAY_ROW_START_SLOT : NIGHT_ROW_START_SLOT
  return (s - rowStart + SLOTS_PER_DAY) % SLOTS_PER_DAY
}

/** The Night row's midnight tick sits between position 11 and 12 (its midpoint). */
export const MIDNIGHT_TICK_POSITION = SLOTS_PER_ROW / 2

/* ------------------------------------------------------------------ *
 * Hour tick labels beneath each row.
 *
 * The prototype printed a single 13-label ruler (12a 2a … 12a) under its one
 * 48-slot strip. The two-row layout needs the same ruler split per row, so it
 * is derived from the row's own start slot rather than hardcoded: 7 labels at
 * 2-hour (4-slot) intervals, inclusive of both row edges.
 *
 *   day   -> 6a  8a  10a 12p 2p  4p  6p
 *   night -> 6p  8p  10p 12a 2a  4a  6a
 * ------------------------------------------------------------------ */

/** Slots between two adjacent tick labels — 4 slots = 2 hours. */
export const TICK_STEP_SLOTS = 4

/** e.g. 0 -> "12a", 13 -> "1p". */
export function formatHourTick(hour24: number): string {
  const h = ((hour24 % 24) + 24) % 24
  const suffix = h < 12 ? 'a' : 'p'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${suffix}`
}

/** The 7 tick labels for a row, left to right. */
export function rowTickLabels(period: Period): string[] {
  const startSlot = period === 'day' ? DAY_ROW_START_SLOT : NIGHT_ROW_START_SLOT
  const count = SLOTS_PER_ROW / TICK_STEP_SLOTS + 1
  return Array.from({ length: count }, (_, i) =>
    String(((startSlot + i * TICK_STEP_SLOTS) / 2) % 24).padStart(2, '0'),
  )
}

export function normalizeSlot(slot: number): number {
  return ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY
}

/* ------------------------------------------------------------------ *
 * Real device time -> slot index.
 * The prototype hardcoded NOW_INDEX = 32; this derives it for real.
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
 * Time formatting — ported from the prototype's fmtRange / fmtShort.
 * ------------------------------------------------------------------ */

function formatClock(totalMinutes: number): string {
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** e.g. "4:00 PM – 4:30 PM" */
export function formatSlotRange(slot: number): string {
  const start = normalizeSlot(slot) * SLOT_MINUTES
  return `${formatClock(start)} – ${formatClock(start + SLOT_MINUTES)}`
}

/** e.g. "4:00 PM" */
export function formatSlotStart(slot: number): string {
  return formatClock(normalizeSlot(slot) * SLOT_MINUTES)
}

/* ------------------------------------------------------------------ *
 * Capacity: <= 2 activities per slot, <= 30 combined minutes.
 * `excludeIndex` lets an in-place edit ignore its own current duration.
 * ------------------------------------------------------------------ */

/**
 * One shared instance is handed back for EVERY empty slot, so it is frozen (and
 * `SlotEntry` is `readonly`): mutating it would silently rewrite every empty
 * slot on the board at once. Deep-frozen because the arrays are what a caller
 * would reach for.
 */
const EMPTY_ENTRY: SlotEntry = Object.freeze({
  activities: Object.freeze([]),
  flags: Object.freeze([]),
})

export function entryAt(entries: SlotEntries, slot: number): SlotEntry {
  return entries[normalizeSlot(slot)] ?? EMPTY_ENTRY
}

export function usedMinutes(entry: SlotEntry, excludeIndex: number | null = null): number {
  return entry.activities.reduce(
    (sum, activity, index) => (index === excludeIndex ? sum : sum + activity.duration),
    0,
  )
}

export function remainingMinutes(
  entry: SlotEntry,
  excludeIndex: number | null = null,
): number {
  return Math.max(0, SLOT_MINUTES - usedMinutes(entry, excludeIndex))
}

/** True when the slot can take no further activity (2 activities OR 30 min). */
export function isSlotFull(entry: SlotEntry): boolean {
  return (
    entry.activities.length >= MAX_ACTIVITIES_PER_SLOT || remainingMinutes(entry) < MIN_DURATION
  )
}

/**
 * Find an activity anchored at an EARLIER slot whose duration reaches into
 * `target` — i.e. the source of `target`'s spillover, if any. Deliberately
 * skips `target`'s own entry: a slot's own committed activities are never
 * "spillover" onto itself.
 */
function spilloverSource(
  entries: SlotEntries,
  target: number,
): { startSlot: number; index: number; activity: PlacedActivity } | null {
  for (const [start, entry] of Object.entries(entries)) {
    const startSlot = Number(start)
    if (startSlot === target) continue
    const index = entry.activities.findIndex((activity) =>
      activitySlots(startSlot, activity.duration).includes(target),
    )
    if (index >= 0) return { startSlot, index, activity: entry.activities[index] }
  }
  return null
}

/**
 * The activity (if any) spilling into `slot` from an earlier anchor, together
 * with how many of ITS minutes fall inside `slot` specifically. There is only
 * ever ONE copy of the activity — it still lives at `anchorSlot`/`index` —
 * this is a read-only view for rendering a slot's own share of it (e.g. the
 * "In this slot" list, the capacity meter) without duplicating the record.
 * Any edit or removal must still be dispatched against `anchorSlot`/`index`.
 */
export function spilloverActivity(
  entries: SlotEntries,
  slot: number,
): { anchorSlot: number; index: number; activity: PlacedActivity; minutesHere: number } | null {
  const target = normalizeSlot(slot)
  const source = spilloverSource(entries, target)
  if (!source) return null
  const offsetSlots = normalizeSlot(target - source.startSlot)
  const minutesIntoActivity = offsetSlots * SLOT_MINUTES
  const minutesHere = Math.max(
    0,
    Math.min(SLOT_MINUTES, source.activity.duration - minutesIntoActivity),
  )
  return { anchorSlot: source.startSlot, index: source.index, activity: source.activity, minutesHere }
}

/**
 * Minutes of `slot` already consumed by an activity anchored at an EARLIER
 * slot and spilling into it (e.g. a 45-minute activity anchored one slot back
 * leaves 15 minutes of spillover here). 0 when nothing spills in.
 *
 * This is independent of the slot's OWN committed activities — the two are
 * combined by `remainingMinutesAt` / `isSlotFullAt` below, which is what lets
 * a slot with 15 minutes of spillover still take a 15-minute activity of its
 * own instead of being blocked outright.
 */
export function spilloverMinutes(entries: SlotEntries, slot: number): number {
  return spilloverActivity(entries, slot)?.minutesHere ?? 0
}

/**
 * Remaining minutes available for a NEW (or edited) activity anchored at
 * `slot`, accounting for both the slot's own committed activities and any
 * spillover it is inheriting from an earlier anchor's longer activity.
 */
export function remainingMinutesAt(
  entries: SlotEntries,
  slot: number,
  excludeIndex: number | null = null,
): number {
  const entry = entryAt(entries, slot)
  return Math.max(0, remainingMinutes(entry, excludeIndex) - spilloverMinutes(entries, slot))
}

/**
 * True when `slot` can take no further activity, given its own committed
 * activities AND any spillover it is inheriting. A slot that is merely
 * PARTIALLY covered by spillover (genuine leftover minutes remain) is NOT
 * full — only once its own capacity, net of spillover, is exhausted.
 */
export function isSlotFullAt(entries: SlotEntries, slot: number): boolean {
  const entry = entryAt(entries, slot)
  return (
    entry.activities.length >= MAX_ACTIVITIES_PER_SLOT ||
    remainingMinutesAt(entries, slot) < MIN_DURATION
  )
}

/**
 * Largest duration that may be committed right now, snapped down to the 15-min
 * step. Returns 0 when nothing can be placed at all. When editing an existing
 * entry the activity-count limit does not apply — it is a replacement.
 */
export function maxDurationFor(
  entry: SlotEntry,
  excludeIndex: number | null = null,
): number {
  const isEditing = excludeIndex !== null
  const slotsTaken = entry.activities.length - (isEditing ? 1 : 0)
  if (!isEditing && slotsTaken >= MAX_ACTIVITIES_PER_SLOT) return 0

  const remaining = remainingMinutes(entry, excludeIndex)
  return Math.floor(remaining / DURATION_STEP) * DURATION_STEP
}

/** Clamp a desired duration into the legal range. 0 means "cannot place". */
export function clampDuration(desired: number, max: number): number {
  if (max < MIN_DURATION) return 0
  const snapped = Math.round(desired / DURATION_STEP) * DURATION_STEP
  return Math.min(max, Math.max(MIN_DURATION, snapped))
}

/** Default duration when a card is placed: fill what is left, up to 30. */
export function defaultDurationFor(
  entry: SlotEntry,
  excludeIndex: number | null = null,
): number {
  return clampDuration(SLOT_MINUTES, maxDurationFor(entry, excludeIndex))
}

/**
 * Locate the activity occupying a slot, returning its anchor and index.
 *
 * An activity anchored exactly AT `slot` always takes priority over one that
 * merely spills into it from an earlier anchor's longer activity — the two
 * can coexist once a slot has genuine leftover minutes after the spillover
 * (see `spilloverMinutes` / `remainingMinutesAt`), and callers that resolve
 * "which activity does this slot belong to" (selection, the timeline's
 * per-cell label) need the slot's own activity, not the one spilling past it.
 */
export function activityAtSlot(
  entries: SlotEntries,
  slot: number,
): { startSlot: number; index: number } | null {
  const target = normalizeSlot(slot)
  const ownEntry = entries[target]
  if (ownEntry && ownEntry.activities.length > 0) {
    return { startSlot: target, index: 0 }
  }
  const spilling = spilloverSource(entries, target)
  return spilling ? { startSlot: spilling.startSlot, index: spilling.index } : null
}

/** Maximum duration across consecutive empty slots from an activity's start. */
export function maxScheduleDuration(
  entries: SlotEntries,
  startSlot: number,
  editingIndex: number | null = null,
): number {
  const start = normalizeSlot(startSlot)
  const startEntry = entryAt(entries, start)

  const spillover = spilloverMinutes(entries, start)
  if (spillover > 0) {
    // This slot inherits some of its 30 minutes from an earlier anchor's
    // longer activity spilling into it. A new or edited activity here may
    // only use whatever minutes are left net of that spillover (0 when the
    // spillover fills the whole slot) — it can never itself spill forward,
    // and it never displaces the earlier anchor.
    const isEditing = editingIndex !== null
    const slotsTaken = startEntry.activities.length - (isEditing ? 1 : 0)
    if (!isEditing && slotsTaken >= MAX_ACTIVITIES_PER_SLOT) return 0
    const available = remainingMinutesAt(entries, start, editingIndex)
    return Math.floor(available / DURATION_STEP) * DURATION_STEP
  }

  const startMax = maxDurationFor(startEntry, editingIndex)
  if (startMax <= 0) return 0

  // A partially filled start slot cannot turn into a multi-slot schedule.
  if (startEntry.activities.length > 0 && editingIndex === null) return startMax

  let duration = startMax
  for (let offset = 1; offset < SLOTS_PER_DAY; offset += 1) {
    const occupied = activityAtSlot(entries, start + offset)
    if (occupied && !(occupied.startSlot === start && occupied.index === editingIndex)) break
    duration += SLOT_MINUTES
  }
  return duration
}

/** Returns the 30-minute slots occupied by an activity's time range. */
export function activitySlots(startSlot: number, duration: number): number[] {
  return Array.from(
    { length: Math.ceil(duration / SLOT_MINUTES) },
    (_, offset) => normalizeSlot(startSlot + offset),
  )
}

/** Visible pieces of one anchored activity within a Day or Night row. */
export function activityRowSegments(
  startSlot: number,
  duration: number,
  period: Period,
): Array<{ startPosition: number; minutes: number }> {
  const rowSlots = rowSlotIndices(period)
  const positions = activitySlots(startSlot, duration)
    .map((slot) => rowSlots.indexOf(slot))
    .filter((position) => position >= 0)
  if (positions.length === 0) return []

  const segments: Array<{ startPosition: number; minutes: number }> = []
  let startPosition = positions[0]
  let length = 1
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index] === positions[index - 1] + 1) {
      length += 1
    } else {
      segments.push({ startPosition, minutes: Math.min(duration, length * SLOT_MINUTES) })
      startPosition = positions[index]
      length = 1
    }
  }
  segments.push({ startPosition, minutes: Math.min(duration, length * SLOT_MINUTES) })
  return segments
}

/** One positioned, colourable piece of the timeline strip for a row. */
export interface RowActivitySegment {
  /** Anchor slot the underlying activity is really stored at. */
  anchorSlot: number
  /** Index into that anchor's own `activities` array. */
  activityIndex: number
  activity: PlacedActivity
  /** Column position (0..`SLOTS_PER_ROW`-1) where this piece starts. */
  startPosition: number
  /** Minutes this piece spans (see `activityRowSegments`). */
  minutes: number
  /**
   * How far, in minutes, into `startPosition`'s own cell this piece's visual
   * start is nudged — non-zero ONLY for the first piece of an activity
   * anchored at a slot that is itself receiving spillover from an EARLIER
   * anchor's longer activity (`spilloverMinutes`). Without this, that
   * anchor's own activity rendered starting at the cell's raw left edge —
   * exactly where the earlier activity's spillover was already rendering —
   * so the two visually overlapped: the later one painted on top, hiding the
   * spillover entirely and leaving the cell's true second half blank.
   *
   * A slot receiving spillover can never itself anchor an activity that
   * spans past its own cell (`maxScheduleDuration` never lets one grow
   * beyond the spillover-reduced remainder there), so this only ever applies
   * to a single, one-cell segment — never a later piece of a multi-cell run.
   */
  leadingOffsetMinutes: number
}

/**
 * All positioned segments for a Day or Night row, spillover-aware — the
 * timeline strip's one geometry source, kept separate from the pixel/percent
 * conversion (`left`/`width` styles) so it can be tested without a DOM.
 */
export function rowActivitySegments(entries: SlotEntries, period: Period): RowActivitySegment[] {
  const result: RowActivitySegment[] = []
  for (const [start, entry] of Object.entries(entries)) {
    const anchorSlot = Number(start)
    const leadingOffset = spilloverMinutes(entries, anchorSlot)
    entry.activities.forEach((activity, activityIndex) => {
      activityRowSegments(anchorSlot, activity.duration, period).forEach((segment, segmentIndex) => {
        result.push({
          anchorSlot,
          activityIndex,
          activity,
          startPosition: segment.startPosition,
          minutes: segment.minutes,
          leadingOffsetMinutes: segmentIndex === 0 ? leadingOffset : 0,
        })
      })
    })
  }
  return result
}

/** Number of visible 30-minute units occupied by scheduled activities. */
export function countOccupiedSlots(entries: SlotEntries): number {
  const occupied = new Set<number>()
  for (const [slot, entry] of Object.entries(entries)) {
    for (const activity of entry.activities) {
      activitySlots(Number(slot), activity.duration).forEach((occupiedSlot) =>
        occupied.add(occupiedSlot),
      )
    }
  }
  return occupied.size
}

/** Number of slots holding at least one activity. Drives the glance caption. */
export function countMarkedSlots(entries: SlotEntries): number {
  return Object.values(entries).filter((entry) => entry.activities.length > 0).length
}
