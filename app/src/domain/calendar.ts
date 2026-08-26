/**
 * Pure month-grid arithmetic for the header date picker (BL-2). No React, no
 * state — mirrors `domain/slots.ts`'s own "pure derivation only" rule. Every
 * `Date` here is a local-midnight instant; nothing touches hours/minutes.
 */

/** Local midnight of the 1st of the month `date` falls in. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** `date` shifted by `delta` whole days — rolls the month/year in either direction. */
export function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta)
}

/**
 * Local midnight of the Sunday on or before `date` — Sunday-first, matching
 * `DatePicker`'s own week layout (`WEEKDAY_LABELS` starts 'Su'), so a "week"
 * means the same seven days everywhere in the product.
 */
export function startOfWeek(date: Date): Date {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return addDays(midnight, -midnight.getDay())
}

/** `date`'s month shifted by `delta` whole months — rolls the year in either direction. */
export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

/** How many days are in the calendar month `date` falls in (28–31). */
export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

/**
 * Always exactly 6 rows x 7 columns (42 days), Sunday-first, padded with the
 * trailing days of the surrounding months so the grid is always full — a
 * short month never reflows the popover to a shorter shape than a long one.
 * `monthStart` MUST be the 1st of a month (see `startOfMonth`).
 */
export function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = monthStart.getDay() // 0 = Sunday
  const gridStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1 - firstWeekday,
  )
  return Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  )
}
