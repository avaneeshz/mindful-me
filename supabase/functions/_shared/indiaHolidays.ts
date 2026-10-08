/**
 * Indian holidays and festivals for the Classic calendar (#10), read from
 * Google's public "Holidays in India" calendar. Covers national holidays and
 * festivals of every major faith. Days Google marks as an "Observance"
 * (Teachers' Day, Mother's Day and so on) are left out on purpose.
 *
 * Pure: the edge function does the fetch, this module only shapes the data.
 */

export const INDIA_HOLIDAY_CALENDAR_ID = 'en.indian#holiday@group.v.calendar.google.com'

export interface Holiday {
  /** `YYYY-MM-DD`, a calendar date with no time zone. */
  date: string
  name: string
}

/** The subset of a Google Calendar event this needs. */
export interface GoogleCalendarEvent {
  summary?: string
  description?: string
  status?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

export function holidaysUrl(year: number, apiKey: string): string {
  const params = new URLSearchParams({
    key: apiKey,
    timeMin: `${year}-01-01T00:00:00Z`,
    timeMax: `${year + 1}-01-01T00:00:00Z`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  })
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(INDIA_HOLIDAY_CALENDAR_ID)}/events?${params}`
}

function isObservance(event: GoogleCalendarEvent): boolean {
  return (event.description ?? '').trim().toLowerCase().startsWith('observance')
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

/**
 * All-day events become one `Holiday` per day they cover (Google's end date
 * is exclusive). Cancelled events, timed events and observances are dropped,
 * as are exact duplicates. Only dates inside `year` are kept.
 */
export function holidaysFromEvents(events: readonly GoogleCalendarEvent[], year: number): Holiday[] {
  const seen = new Set<string>()
  const out: Holiday[] = []
  for (const event of events) {
    const name = event.summary?.trim()
    const start = event.start?.date
    if (!name || !start || event.status === 'cancelled' || isObservance(event)) continue
    const end = event.end?.date ?? nextDay(start)
    // Guard against a malformed range ever looping for long.
    for (let day = start, i = 0; day < end && i < 31; day = nextDay(day), i++) {
      if (!day.startsWith(`${year}-`)) continue
      const key = `${day}|${name}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ date: day, name })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}
