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

/**
 * The inverse of `localDateISO` — local midnight of the calendar day
 * `YYYY-MM-DD` names. Parsed by hand rather than via `new Date(iso)`, which
 * treats a bare date string as UTC midnight and so lands on the PREVIOUS day
 * for any timezone behind UTC.
 *
 * Phase 5 needs this because a queued write carries the calendar day it was
 * anchored to as a string (it has to survive being written to storage and
 * reloaded, possibly days later), and flushing it means turning that day back
 * into the same real instants the write originally meant.
 */
export function localDateFromISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
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
 * True when `a` and `b` fall on the same local calendar day, independent of
 * their time-of-day. Drives BL-2's "NOW marker only on the real current
 * day" rule — comparing `viewedDate` against the live device clock.
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDateISO(a) === localDateISO(b)
}
