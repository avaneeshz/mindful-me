/**
 * The shared scheduling module (Target Architecture — see the
 * full-stack-engineer agent definition). Both entry gestures — dragging a
 * card onto a time, and selecting a slot then picking an activity — call
 * exactly these functions, never a parallel implementation:
 *
 *   computeCandidateSchedule(activityRef, startAt, existing, opts) -> CandidateSchedule
 *   validateSchedule(candidate, existing)                          -> ValidationResult
 *   commitSchedule(candidate, ...)                                 -> ScheduledActivity
 *
 * A drop resolves to a `startMinutes` (snapped to the 30-minute grid — the
 * "friendly nearby time" of rule 5, since the grid's own buttons are the drop
 * targets, there is no pixel-exact drop position to snap) and calls
 * `computeCandidateSchedule` with a default duration; the click-select path
 * calls it identically. Neither commits — `commitSchedule` is the one write
 * path, and the reducer is the one thing that calls it (see
 * `state/boardReducer.ts`'s `commit` action).
 *
 * The one product rule enforced here: NO TWO ACTIVITIES MAY OVERLAP, ever
 * (rule 1). There is no other placement constraint — no per-window activity
 * count, no per-window minute cap. Splitting one logical activity across two
 * disjoint free gaps is not supported (rule 13): when the requested duration
 * does not fit contiguously, the candidate is clamped to the longest
 * contiguous run available from its start, never split into two ranges.
 */
import type { ActivityList, ActivityQuality, FlagId, ScheduledActivity, ScheduleStatus, Symptom } from './types'

export const MIN_DURATION_MINUTES = 1
/**
 * The stepper's per-click increment. Rule 5 calls for fine-tuning to the
 * exact minute (the old 15-minute-locked step is gone — an activity may now
 * legitimately land on any minute, e.g. from an overlap-driven ceiling
 * clamp), balanced against the product's "fast interaction" principle
 * (CLAUDE.md): a literal 1-minute click step would take 12 clicks just to
 * grow a 30-minute activity by a quarter hour. 5 minutes is the smallest
 * step that still reaches most real-world durations in a handful of clicks
 * while making every exact minute reachable a click or two either side of a
 * 5-minute mark; nothing in the model stops a duration from sitting on a
 * non-multiple-of-5 value (e.g. a ceiling clamp), only the STEPPER's own
 * click increment is coarser than 1.
 */
export const DURATION_STEP_MINUTES = 5
/** Offered duration for a brand-new placement, before the ceiling clamps it. */
export const DEFAULT_DURATION_MINUTES = 30
/** One calendar day, in minutes — the board's own time axis. */
export const MINUTES_PER_DAY = 1440

export interface ActivityRef {
  name: string
  path: string[]
}

/**
 * A not-yet-committed placement. `id` is set only when this candidate
 * represents an in-place EDIT of an existing activity — its own current
 * placement is then excluded from the overlap/ceiling checks against itself.
 */
export interface CandidateSchedule {
  id: string | null
  activity: ActivityRef | null
  startMinutes: number
  durationMinutes: number
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: 'occupied' | 'too-long'; maxDuration: number }

function isReal(a: ScheduledActivity): boolean {
  return a.durationMinutes > 0
}

/** True when `minute` falls inside `activity`'s [start, start+duration) range. */
function covers(activity: ScheduledActivity, minute: number): boolean {
  return (
    isReal(activity) &&
    activity.startMinutes <= minute &&
    minute < activity.startMinutes + activity.durationMinutes
  )
}

/**
 * The activity (if any, other than `excludeId`) whose range covers `minute`.
 */
function blockerAt(
  existing: ActivityList,
  minute: number,
  excludeId: string | null,
): ScheduledActivity | undefined {
  return existing.find((a) => a.id !== excludeId && covers(a, minute))
}

/**
 * Earliest minute >= `from` not covered by any OTHER activity. Used to
 * resolve "add into this slot" to the actual free instant within it, rather
 * than blindly anchoring at the slot's own start when something already
 * covers that exact minute (the bug the old slot-capacity model papered over
 * by never modelling real start times at all — see `domain/types.ts`).
 *
 * Bounded: each iteration jumps past exactly one blocker's end, so this
 * terminates within `existing.length + 1` steps.
 */
export function nextFreeStart(
  existing: ActivityList,
  from: number,
  excludeId: string | null = null,
): number {
  let candidate = from
  for (let guard = 0; guard <= existing.length; guard += 1) {
    const blocker = blockerAt(existing, candidate, excludeId)
    if (!blocker) return candidate
    candidate = blocker.startMinutes + blocker.durationMinutes
  }
  return candidate
}

/**
 * The continuous-block ceiling (rule 13): the largest duration a NEW or
 * EDITED activity anchored exactly at `start` may take without overlapping
 * anything else — i.e. minutes until the next activity's start, or 0 if
 * `start` itself is already occupied. Never offers a split placement; the
 * caller (`computeCandidateSchedule`) simply clamps to this ceiling.
 */
export function maxContiguousDuration(
  existing: ActivityList,
  start: number,
  excludeId: string | null = null,
): number {
  if (blockerAt(existing, start, excludeId)) return 0

  let ceiling = MINUTES_PER_DAY - start
  for (const a of existing) {
    if (a.id === excludeId || !isReal(a)) continue
    if (a.startMinutes >= start && a.startMinutes - start < ceiling) {
      ceiling = a.startMinutes - start
    }
  }
  return Math.max(0, ceiling)
}

/**
 * The valid MOVE range for a fixed-duration block currently anchored at
 * `anchorStart` (Duration drag-block — moving the whole pill keeps its
 * duration fixed and only changes where it starts). Bounded by the immediate
 * neighbours either side of the gap `anchorStart` already sits in — the same
 * rule 1 no-overlap check `maxContiguousDuration` already enforces, just
 * generalized to a range with two edges instead of one. This is a NEW UI
 * (drag/keyboard move) for the EXISTING rule, not a new placement rule.
 */
export function moveBounds(
  existing: ActivityList,
  anchorStart: number,
  durationMinutes: number,
  excludeId: string | null = null,
): { min: number; max: number } {
  let min = 0
  let max = MINUTES_PER_DAY - durationMinutes
  for (const a of existing) {
    if (a.id === excludeId || !isReal(a)) continue
    const aEnd = a.startMinutes + a.durationMinutes
    if (aEnd <= anchorStart && aEnd > min) min = aEnd
    if (a.startMinutes >= anchorStart && a.startMinutes - durationMinutes < max) {
      max = a.startMinutes - durationMinutes
    }
  }
  return { min, max: Math.max(min, max) }
}

/** Clamp a desired start into `moveBounds`'s range — the drag-block's hard-stop. */
export function clampMove(
  existing: ActivityList,
  anchorStart: number,
  durationMinutes: number,
  desiredStart: number,
  excludeId: string | null = null,
): number {
  const { min, max } = moveBounds(existing, anchorStart, durationMinutes, excludeId)
  return Math.min(max, Math.max(min, Math.round(desiredStart)))
}

/**
 * The valid range for the LEFT edge of a duration block whose END
 * (`currentEnd`) stays fixed while its start moves (Duration drag-block —
 * resizing from the start handle). Bounded below by the nearest preceding
 * activity's end, and above by `currentEnd - MIN_DURATION_MINUTES` (a block
 * can shrink to 1 minute, never to nothing). Same rule 1, new UI.
 */
export function resizeStartBounds(
  existing: ActivityList,
  currentStart: number,
  currentEnd: number,
  excludeId: string | null = null,
): { min: number; max: number } {
  let min = 0
  for (const a of existing) {
    if (a.id === excludeId || !isReal(a)) continue
    const aEnd = a.startMinutes + a.durationMinutes
    if (aEnd <= currentStart && aEnd > min) min = aEnd
  }
  const max = Math.max(min, currentEnd - MIN_DURATION_MINUTES)
  return { min, max }
}

/** Clamp a desired new start (end fixed) into `resizeStartBounds`'s range. */
export function clampResizeStart(
  existing: ActivityList,
  currentStart: number,
  currentEnd: number,
  desiredStart: number,
  excludeId: string | null = null,
): number {
  const { min, max } = resizeStartBounds(existing, currentStart, currentEnd, excludeId)
  return Math.min(max, Math.max(min, Math.round(desiredStart)))
}

/** Clamp a desired duration into the legal range for a given ceiling. */
export function clampDuration(desired: number, ceiling: number): number {
  if (ceiling < MIN_DURATION_MINUTES) return 0
  return Math.min(ceiling, Math.max(MIN_DURATION_MINUTES, Math.round(desired)))
}

/**
 * Clamp a desired duration for the STEPPER specifically. The floor here is
 * `DURATION_STEP_MINUTES` (5) itself, not the domain-wide `MIN_DURATION_MINUTES`
 * (1) that `clampDuration` uses for free-form/manual entry: the stepper only
 * ever moves in +/-5 increments, so its own floor has to be a multiple of 5,
 * or repeatedly stepping down bottoms out at 1 and stepping back up from
 * there drifts onto 6, 11, 16... instead of 5, 10, 15... — every subsequent
 * +/-5 click has to land back on the grid.
 */
export function clampStepDuration(desired: number, ceiling: number): number {
  if (ceiling < MIN_DURATION_MINUTES) return 0
  return Math.min(ceiling, Math.max(DURATION_STEP_MINUTES, Math.round(desired)))
}

/** True when nothing may be newly placed starting within [start, start+windowMinutes). */
export function isWindowFull(existing: ActivityList, start: number, windowMinutes: number): boolean {
  return nextFreeStart(existing, start) >= start + windowMinutes
}

/**
 * Resolve a requested placement — new or in-place edit — into a candidate.
 * Never commits. `startMinutes` is the requested anchor (already snapped to
 * the friendly grid by the caller, e.g. the slot the user clicked or dropped
 * on); this resolves it to the actual free instant at/after that anchor and
 * clamps the duration to the continuous-block ceiling from there.
 */
export function computeCandidateSchedule(
  activity: ActivityRef | null,
  startMinutes: number,
  existing: ActivityList,
  opts: { editingId?: string | null; requestedDuration?: number } = {},
): CandidateSchedule {
  const editingId = opts.editingId ?? null
  const anchor = nextFreeStart(existing, startMinutes, editingId)
  const ceiling = maxContiguousDuration(existing, anchor, editingId)
  const requested = opts.requestedDuration ?? DEFAULT_DURATION_MINUTES
  return {
    id: editingId,
    activity,
    startMinutes: anchor,
    durationMinutes: clampDuration(requested, ceiling),
  }
}

/**
 * Re-check a candidate against the current board — the one gate every commit
 * passes through. Enforces rule 1 (no overlap) and rule 13 (no split) as a
 * single ceiling check: a candidate that fits is, by construction, overlap-
 * free, since the ceiling is defined as "up to the next activity's start".
 */
export function validateSchedule(
  candidate: CandidateSchedule,
  existing: ActivityList,
): ValidationResult {
  const ceiling = maxContiguousDuration(existing, candidate.startMinutes, candidate.id)
  if (ceiling <= 0) return { ok: false, reason: 'occupied', maxDuration: 0 }
  if (candidate.durationMinutes > ceiling) {
    return { ok: false, reason: 'too-long', maxDuration: ceiling }
  }
  return { ok: true }
}

export interface CommitContext {
  flags?: FlagId[]
  /** "Activity quality" — optional, multi-select (see domain/types.ts). */
  quality?: ActivityQuality[]
  /** "Chronic Symptoms" — optional, multi-select (see domain/types.ts). */
  symptoms?: Symptom[]
  /** Freeform notes — optional, encrypted at rest like quality/flags/symptoms. */
  notes?: string | null
  status?: ScheduleStatus
  timezone?: string
  id?: string
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * The one write path. Callers MUST validate first (`validateSchedule`) —
 * this does not re-check overlap itself, so that a caller which already
 * holds a validated candidate never pays for a redundant scan. Preserves
 * rule 4 (editing time/duration never silently clears completion): when
 * `context` is omitted for an in-place edit, the caller is expected to have
 * carried the prior `flags`/`status`/`timezone`/`id` forward explicitly.
 */
export function commitSchedule(
  candidate: CandidateSchedule,
  context: CommitContext = {},
): ScheduledActivity {
  return {
    id: context.id ?? candidate.id ?? generateId(),
    name: candidate.activity?.name ?? null,
    path: candidate.activity?.path ?? [],
    startMinutes: candidate.startMinutes,
    durationMinutes: candidate.durationMinutes,
    flags: context.flags ?? [],
    quality: context.quality ?? [],
    symptoms: context.symptoms ?? [],
    notes: context.notes ?? null,
    status: context.status ?? 'planned',
    timezone:
      context.timezone ??
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
  }
}

/**
 * How a [startMinutes, startMinutes + durationMinutes) span's minutes split
 * across the calendar day it started on and the next one (rule 2). Pure and
 * timezone-agnostic — the caller supplies real calendar boundaries; this
 * only does the minute arithmetic that daily/weekly aggregation queries
 * (Phase 4, not built in this pass) will need to attribute a midnight-
 * crossing activity to both days it touches.
 */
export function splitMinutesAcrossDays(
  startMinutes: number,
  durationMinutes: number,
): { sameDayMinutes: number; nextDayMinutes: number } {
  const sameDayMinutes = Math.max(0, Math.min(durationMinutes, MINUTES_PER_DAY - startMinutes))
  return { sameDayMinutes, nextDayMinutes: Math.max(0, durationMinutes - sameDayMinutes) }
}

/** The [start, end) minute range flags/activities occupy — end may exceed 1440. */
export function endMinutes(a: Pick<ScheduledActivity, 'startMinutes' | 'durationMinutes'>): number {
  return a.startMinutes + a.durationMinutes
}
