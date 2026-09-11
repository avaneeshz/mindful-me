import type { ScheduledActivity } from './types'

/**
 * The 6am-to-6am "window day" (see `lib/localTime.ts`'s `windowRange`) as a
 * single continuous MINUTE AXIS, so all the grid geometry and every
 * scheduling check work in one coordinate space regardless of which calendar
 * day a minute actually falls on.
 *
 * Board minute 0 is `viewedDate` 00:00 (kept as the origin so the 0–47 grid
 * cell index stays "cell i = i·30 minutes after midnight" for the day row +
 * the evening half of the night row, unchanged). The window itself is only
 * the slice [BOARD_START_MIN, BOARD_END_MIN):
 *
 *   BOARD_START_MIN 360   = viewedDate 06:00      — first visible minute (day row)
 *   1080                  = viewedDate 18:00      — day row ends / night row begins
 *   1440                  = midnight              — the night row's midpoint tick
 *   BOARD_END_MIN   1800  = (viewedDate+1) 06:00  — last visible minute
 *
 * The small hours (board 1440–1800) are the NEXT calendar day's 00:00–06:00,
 * so an activity drawn there has `localDate` one day after `viewedDate`.
 */
export const MINUTES_PER_DAY = 1440
export const BOARD_START_MIN = 360
export const BOARD_END_MIN = 1800

/** Parse a `YYYY-MM-DD` string to a local-midnight Date (no UTC shift). */
export function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** `YYYY-MM-DD` for a local Date. */
export function isoOfDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `iso` shifted by `n` whole days, as a `YYYY-MM-DD` string. */
export function isoAddDays(iso: string, n: number): string {
  const d = dateFromISO(iso)
  d.setDate(d.getDate() + n)
  return isoOfDate(d)
}

/** Whole days from window-day `viewedDateISO` to calendar day `localDateISO` (0 same, 1 = day after, -1 = day before). */
export function dayDelta(viewedDateISO: string, localDateISO: string): number {
  const a = dateFromISO(viewedDateISO).getTime()
  const b = dateFromISO(localDateISO).getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/**
 * Where `activity` starts on `viewedDateISO`'s board, in board minutes. May
 * be negative (a midnight-crosser that began on the previous window-day) or
 * beyond BOARD_END_MIN; callers clip to what is actually visible.
 */
export function activityBoardStart(activity: ScheduledActivity, viewedDateISO: string): number {
  return dayDelta(viewedDateISO, activity.localDate) * MINUTES_PER_DAY + activity.startMinutes
}

/**
 * A wall-clock minute-of-day (0–1439, as typed into a time field) mapped to
 * this window's board minute: the small hours (< 06:00) belong to the next
 * calendar day, so they sit at 1440–1800. Used by the quick-log popovers,
 * whose time inputs are plain "HH:MM".
 */
export function clockMinutesToBoard(minutesOfDay: number): number {
  return minutesOfDay < BOARD_START_MIN ? minutesOfDay + MINUTES_PER_DAY : minutesOfDay
}

/** The board-minute [start, end) a 0–47 grid cell occupies on the current window. */
export function slotBoardRange(slot: number): { start: number; end: number } {
  const s = ((slot % 48) + 48) % 48
  // Cells 0–11 (00:00–06:00) are the NEXT day's small hours — board 1440–1800.
  const start = s < 12 ? s * 30 + MINUTES_PER_DAY : s * 30
  return { start, end: start + 30 }
}

/**
 * Split a resolved board-minute start back into what gets stored: the
 * calendar day it lands on and the minutes-since-that-day's-midnight. The
 * inverse of `activityBoardStart` for a freshly placed activity.
 */
export function boardStartToStorage(
  boardStart: number,
  viewedDateISO: string,
): { localDate: string; startMinutes: number } {
  if (boardStart >= MINUTES_PER_DAY) {
    return { localDate: isoAddDays(viewedDateISO, 1), startMinutes: boardStart - MINUTES_PER_DAY }
  }
  return { localDate: viewedDateISO, startMinutes: boardStart }
}

/**
 * An activity mapped into board-minute space for the given window: a shallow
 * copy with `startMinutes` replaced by its board position. Used to feed the
 * `domain/scheduling.ts` functions (which reason on one minute axis) and the
 * `domain/slots.ts` geometry from a `state.activities` list whose rows may
 * belong to two different calendar days.
 */
export function toBoardActivity<T extends ScheduledActivity>(activity: T, viewedDateISO: string): T {
  return { ...activity, startMinutes: activityBoardStart(activity, viewedDateISO) }
}

/** `toBoardActivity` across a list. */
export function toBoardActivities<T extends ScheduledActivity>(
  activities: readonly T[],
  viewedDateISO: string,
): T[] {
  return activities.map((a) => toBoardActivity(a, viewedDateISO))
}
