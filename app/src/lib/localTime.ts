/**
 * Local wall-clock <-> real instant conversion for the device's OWN current
 * timezone (rule 3). Deliberately does not accept an arbitrary IANA zone
 * name to convert into: every `ScheduledActivity` in this client is created
 * from the device's live `Date`, and the JS `Date` constructor already
 * resolves year/month/day/hour/minute against the OS's own tz database
 * correctly (DST included) — reimplementing that against a NAMED zone would
 * need a timezone library this app does not otherwise need. What IS stored
 * alongside every activity (`timezone`, via `deviceTimezone()`) is a record
 * of which zone produced it, satisfying "store ... the IANA timezone it was
 * logged in" — not a general zone-conversion capability.
 */

/** e.g. "Asia/Kolkata". Falls back to "UTC" if the runtime can't resolve one. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * The real instant `minutesSinceMidnight` (0–1439, may push past 1439 for a
 * midnight-crossing activity — rule 2) represents, anchored to the same
 * calendar day as `reference`, in the device's own current timezone.
 */
export function dateFromLocalMinutes(reference: Date, minutesSinceMidnight: number): Date {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    0,
    minutesSinceMidnight,
    0,
    0,
  )
}

/** `YYYY-MM-DD` for the calendar day `date` falls on, in local time — never UTC-shifted. */
export function localDateISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Minutes since local midnight for a real Date already known to fall on `reference`'s day. */
export function localMinutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/** `[startOfDay, startOfNextDay)` for the calendar day `reference` falls on, as real instants. */
export function localDayRange(reference: Date): { start: Date; end: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

/**
 * The timeline is a 6am-to-6am "window day", not a midnight-to-midnight
 * calendar day: viewing 11 Sep shows 11 Sep 06:00 → 12 Sep 06:00, so a night
 * reads as one continuous evening → midnight → next-morning span. An activity
 * still BELONGS to the calendar day it started on (rule 2 / `local_date`) —
 * this only changes which window renders it and where.
 */
export const WINDOW_START_HOUR = 6

/**
 * `[reference 06:00, reference+1 day 06:00)` as real instants — the wall-clock
 * span the timeline for window-day `reference` covers. Pair with
 * `apiListScheduledActivities` (a range-overlap query, so a midnight-crossing
 * activity anchored just before the boundary is still returned).
 */
export function windowRange(reference: Date): { start: Date; end: Date } {
  const start = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    WINDOW_START_HOUR,
  )
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

/**
 * The window-day that currently contains `now`: the previous calendar day
 * until 06:00 (you are still inside last night's window at 02:00), then
 * today. Normalized to local midnight so it keys storage / the date picker
 * exactly like a plain calendar date does.
 */
export function currentWindowDate(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (now.getHours() < WINDOW_START_HOUR) d.setDate(d.getDate() - 1)
  return d
}

/**
 * The window-day analogue of `shouldRolloverViewedDate`: a board "following
 * today" advances the instant the device clock crosses **06:00** into a new
 * window-day, but a board deliberately pinned to another window-day (rule 12)
 * is left alone. Told apart using only the state from just before this tick.
 */
export function shouldRolloverWindowDate(viewedDate: Date, prevNow: Date, now: Date): boolean {
  const prevWindow = currentWindowDate(prevNow)
  const nextWindow = currentWindowDate(now)
  if (isSameLocalDay(prevWindow, nextWindow)) return false
  return isSameLocalDay(viewedDate, prevWindow)
}

/**
 * True when `a` and `b` fall on the same local calendar day, independent of
 * their time-of-day. Drives BL-2's "NOW marker only on the real current
 * day" rule — comparing `viewedDate` against the live device clock.
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDateISO(a) === localDateISO(b)
}

/**
 * Whether a device-clock tick that moved from `prevNow` to `now` should
 * auto-advance a "following today" viewed day to `now`'s calendar day.
 *
 * This is the rollover rule behind BL-2's "today" default: a board left
 * mounted across local midnight (a tab backgrounded overnight, not reloaded)
 * must pick up the new day on its own, but a board the user has deliberately
 * pinned to some OTHER day (rule 12 — editing a past day is always allowed)
 * must never be yanked off it just because the wall clock happened to cross
 * midnight somewhere else. The two are told apart using only the state from
 * just BEFORE this tick (`prevNow`, and whatever day `viewedDate` already
 * was) — never "is viewedDate === now's day" after the fact, which a real
 * rollover already breaks by the time you'd go check it.
 *
 * True exactly when: (1) `prevNow` and `now` actually fall on different
 * calendar days — no tick, no rollover to consider — AND (2) `viewedDate`
 * still matched `prevNow`'s day, i.e. the board WAS following today the
 * instant before this crossing. A `viewedDate` pinned to any other day fails
 * (2) and this returns false, leaving that navigation undisturbed.
 */
export function shouldRolloverViewedDate(viewedDate: Date, prevNow: Date, now: Date): boolean {
  if (isSameLocalDay(prevNow, now)) return false
  return isSameLocalDay(viewedDate, prevNow)
}
