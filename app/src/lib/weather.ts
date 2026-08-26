/**
 * BL-3 — real device location + real temperature, city name only. Every
 * network/geolocation call here is injectable (`fetchImpl`, `geolocation`)
 * specifically so the whole chain can be unit-tested against fakes without
 * touching the real network or a real browser permission prompt — see
 * `weather.test.ts`.
 *
 * Chain, in order:
 *   1. Browser geolocation (`navigator.geolocation`) for lat/long.
 *      - Granted: Open-Meteo (temperature) + BigDataCloud (city) in
 *        parallel, both keyless.
 *   2. Denied, unavailable, or (2) both came back empty: IP-based lookup
 *      (ipapi.co, keyless) for a city name — it also returns coordinates,
 *      which are reused for the SAME Open-Meteo temperature call so a denied
 *      prompt still gets a real (if less precise) temperature rather than
 *      none at all.
 *   3. Every path failed: `null` — the caller renders a sensible
 *      empty/unavailable state, never blocks on this, never crashes.
 */

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface WeatherReading {
  /** City name only (rule: no address, no coordinates shown). */
  city: string | null
  temperatureC: number | null
}

type GeolocationOutcome =
  | { kind: 'granted'; coords: Coordinates }
  | { kind: 'denied' }
  | { kind: 'unavailable' }

type GeolocationLike = Pick<Geolocation, 'getCurrentPosition'>

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 10 * 60_000,
}

/** `GeolocationPositionError.PERMISSION_DENIED` — the one outcome the IP fallback is explicitly for. */
const PERMISSION_DENIED = 1

/** Wraps the callback-based Geolocation API in a Promise that never rejects. */
export function requestGeolocation(geolocation: GeolocationLike | undefined): Promise<GeolocationOutcome> {
  return new Promise((resolve) => {
    if (!geolocation) {
      resolve({ kind: 'unavailable' })
      return
    }
    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          kind: 'granted',
          coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
        }),
      (error) => resolve({ kind: error.code === PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      GEOLOCATION_OPTIONS,
    )
  })
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/** Open-Meteo current temperature, Celsius — no key required. */
export async function fetchTemperatureC(
  coords: Coordinates,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m`
  const data = await fetchJson(fetchImpl, url)
  const value = (data as { current?: { temperature_2m?: unknown } } | null)?.current?.temperature_2m
  return typeof value === 'number' ? value : null
}

/** BigDataCloud reverse geocode, client-side endpoint — no key required. */
export async function fetchCityFromCoords(
  coords: Coordinates,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`
  const data = (await fetchJson(fetchImpl, url)) as Record<string, unknown> | null
  if (!data) return null
  // A precise urban point usually has `city`; a rural one often leaves it
  // empty but still has `locality` — fall back to that rather than showing
  // nothing for a real, resolved location.
  const city = typeof data.city === 'string' ? data.city.trim() : ''
  if (city) return city
  const locality = typeof data.locality === 'string' ? data.locality.trim() : ''
  return locality || null
}

interface IpLocation {
  city: string | null
  coords: Coordinates | null
}

/** ipapi.co — city name AND coordinates, no key required, used as the whole-chain fallback. */
export async function fetchIpLocation(fetchImpl: typeof fetch): Promise<IpLocation | null> {
  const data = (await fetchJson(fetchImpl, 'https://ipapi.co/json/')) as Record<string, unknown> | null
  if (!data || data.error) return null
  const city = typeof data.city === 'string' && data.city.trim() ? data.city.trim() : null
  const latitude = typeof data.latitude === 'number' ? data.latitude : null
  const longitude = typeof data.longitude === 'number' ? data.longitude : null
  const coords = latitude !== null && longitude !== null ? { latitude, longitude } : null
  return { city, coords }
}

export interface WeatherDeps {
  geolocation?: GeolocationLike
  fetchImpl?: typeof fetch
}

/**
 * Resolves a `WeatherReading`, or `null` when every path in the chain came
 * back with nothing. Never throws — every step already fails closed to
 * `null`/`undefined` internally.
 */
export async function resolveWeather(deps: WeatherDeps = {}): Promise<WeatherReading | null> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const geo = await requestGeolocation(deps.geolocation)

  if (geo.kind === 'granted') {
    const [city, temperatureC] = await Promise.all([
      fetchCityFromCoords(geo.coords, fetchImpl),
      fetchTemperatureC(geo.coords, fetchImpl),
    ])
    if (city !== null || temperatureC !== null) return { city, temperatureC }
    // Real coordinates, but both keyless APIs failed (e.g. a transient
    // network blip) — fall through to the IP path below rather than
    // reporting total failure with good coordinates in hand.
  }

  const ip = await fetchIpLocation(fetchImpl)
  if (!ip) return null
  const temperatureC = ip.coords ? await fetchTemperatureC(ip.coords, fetchImpl) : null
  if (ip.city === null && temperatureC === null) return null
  return { city: ip.city, temperatureC }
}
