/**
 * What the Classic calendar shows inside a date (#10): Indian holidays and
 * festivals (from the server) and the user's own yearly important days.
 * Pure — no fetching here.
 */

export interface Holiday {
  /** `YYYY-MM-DD`. */
  date: string
  name: string
}

/** A personal day that repeats every year on `month`/`day`. */
export interface ImportantDay {
  id: string
  name: string
  /** 1–12. */
  month: number
  /** 1–31. Feb 29 shows on Feb 28 in years without one. */
  day: number
}

export type CalendarMarkerKind = 'holiday' | 'personal'

export interface CalendarMarker {
  kind: CalendarMarkerKind
  name: string
  /** Set for personal days, so they can be edited or deleted. */
  importantDayId?: string
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysIn(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Where a yearly day lands in `year` — Feb 29 moves to Feb 28 outside leap years. */
export function importantDayDate(day: Pick<ImportantDay, 'month' | 'day'>, year: number): string {
  if (day.month === 2 && day.day === 29 && !isLeapYear(year)) return iso(year, 2, 28)
  return iso(year, day.month, day.day)
}

/**
 * Markers per `YYYY-MM-DD` for the given years. Personal days come first in
 * each date (they're the user's own), then holidays in name order.
 */
export function buildCalendarMarkers(
  holidays: readonly Holiday[],
  importantDays: readonly ImportantDay[],
  years: readonly number[],
): Map<string, CalendarMarker[]> {
  const map = new Map<string, CalendarMarker[]>()
  const add = (date: string, marker: CalendarMarker) => {
    const list = map.get(date)
    if (list) list.push(marker)
    else map.set(date, [marker])
  }
  for (const year of years) {
    for (const d of importantDays) add(importantDayDate(d, year), { kind: 'personal', name: d.name, importantDayId: d.id })
  }
  for (const h of holidays) add(h.date, { kind: 'holiday', name: h.name })
  for (const list of map.values()) {
    list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'personal' ? -1 : 1))
  }
  return map
}

export type ImportantDayProblem = 'nameRequired' | 'nameTooLong' | 'invalidDate'

export const IMPORTANT_DAY_PROBLEM_TEXT: Record<ImportantDayProblem, string> = {
  nameRequired: 'Give this day a name.',
  nameTooLong: 'Keep the name under 80 characters.',
  invalidDate: 'That date doesn’t exist.',
}

/** Same rules the database enforces (`important_days`). Feb 29 is allowed. */
export function validateImportantDay(input: { name: string; month: number; day: number }): ImportantDayProblem | null {
  const name = input.name.trim()
  if (name === '') return 'nameRequired'
  if (name.length > 80) return 'nameTooLong'
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) return 'invalidDate'
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > daysIn(2024, input.month)) return 'invalidDate'
  return null
}
