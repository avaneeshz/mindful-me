import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyUser } from '../_shared/supabaseClients.ts'
import { holidaysFromEvents, holidaysUrl, type GoogleCalendarEvent } from '../_shared/indiaHolidays.ts'

/**
 * POST, Authorization: Bearer <the signed-in user's access token>, body
 * `{ year: number }` → `{ holidays: { date, name }[] }`.
 *
 * Reads Google's public "Holidays in India" calendar with the project's own
 * API key (secret `GOOGLE_CALENDAR_API_KEY`), so the key never reaches the
 * browser. Holidays don't change often, so each year's answer is kept in
 * memory for a day per running instance.
 */
const CACHE_MS = 24 * 60 * 60 * 1000
const cache = new Map<number, { at: number; holidays: unknown }>()

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    await verifyUser(req)
  } catch {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  let year = NaN
  try {
    year = Number((await req.json())?.year)
  } catch {
    // fall through to the range check
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return jsonResponse({ error: 'invalid_year' }, 400)
  }

  const apiKey = Deno.env.get('GOOGLE_CALENDAR_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'not_configured', message: 'GOOGLE_CALENDAR_API_KEY is not set on this project yet.' }, 500)
  }

  const cached = cache.get(year)
  if (cached && Date.now() - cached.at < CACHE_MS) return jsonResponse({ holidays: cached.holidays })

  const res = await fetch(holidaysUrl(year, apiKey))
  if (!res.ok) {
    return jsonResponse({ error: 'upstream_failed', status: res.status }, 502)
  }
  const body = (await res.json()) as { items?: GoogleCalendarEvent[] }
  const holidays = holidaysFromEvents(body.items ?? [], year)
  cache.set(year, { at: Date.now(), holidays })
  return jsonResponse({ holidays })
})
