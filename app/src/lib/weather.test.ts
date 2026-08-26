import { describe, expect, it, vi } from 'vitest'
import {
  fetchCityFromCoords,
  fetchIpLocation,
  fetchTemperatureC,
  requestGeolocation,
  resolveWeather,
} from './weather'

const COORDS = { latitude: 17.385, longitude: 78.4867 }

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

function failingFetch(): typeof fetch {
  return vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch
}

describe('requestGeolocation', () => {
  it('resolves "unavailable" when no geolocation object exists at all', async () => {
    await expect(requestGeolocation(undefined)).resolves.toEqual({ kind: 'unavailable' })
  })

  it('resolves "granted" with lat/long on success', async () => {
    const geolocation = {
      getCurrentPosition: (success: PositionCallback) => {
        success({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition)
      },
    }
    await expect(requestGeolocation(geolocation)).resolves.toEqual({
      kind: 'granted',
      coords: { latitude: 1, longitude: 2 },
    })
  })

  it('resolves "denied" for a PERMISSION_DENIED error (code 1)', async () => {
    const geolocation = {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1 } as GeolocationPositionError)
      },
    }
    await expect(requestGeolocation(geolocation)).resolves.toEqual({ kind: 'denied' })
  })

  it('resolves "unavailable" for POSITION_UNAVAILABLE and TIMEOUT (codes 2, 3)', async () => {
    for (const code of [2, 3]) {
      const geolocation = {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({ code } as GeolocationPositionError)
        },
      }
      await expect(requestGeolocation(geolocation)).resolves.toEqual({ kind: 'unavailable' })
    }
  })
})

describe('fetchTemperatureC', () => {
  it('parses current.temperature_2m from a successful Open-Meteo response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ current: { temperature_2m: 28.4 } }))
    await expect(fetchTemperatureC(COORDS, fetchImpl)).resolves.toBe(28.4)
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('https://api.open-meteo.com/v1/forecast?latitude=17.385&longitude=78.4867'),
    )
  })

  it('returns null on a non-ok HTTP response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false))
    await expect(fetchTemperatureC(COORDS, fetchImpl)).resolves.toBeNull()
  })

  it('returns null when the field is missing or the wrong type', async () => {
    await expect(fetchTemperatureC(COORDS, vi.fn().mockResolvedValue(jsonResponse({})))).resolves.toBeNull()
    await expect(
      fetchTemperatureC(COORDS, vi.fn().mockResolvedValue(jsonResponse({ current: { temperature_2m: '28' } }))),
    ).resolves.toBeNull()
  })

  it('returns null on a network failure rather than throwing', async () => {
    await expect(fetchTemperatureC(COORDS, failingFetch())).resolves.toBeNull()
  })
})

describe('fetchCityFromCoords', () => {
  it('extracts `city` from a successful BigDataCloud response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ city: 'Hyderabad', locality: 'Banjara Hills' }))
    await expect(fetchCityFromCoords(COORDS, fetchImpl)).resolves.toBe('Hyderabad')
  })

  it('falls back to `locality` when `city` is empty (rural points)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ city: '', locality: 'Kotagiri' }))
    await expect(fetchCityFromCoords(COORDS, fetchImpl)).resolves.toBe('Kotagiri')
  })

  it('returns null when both city and locality are empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ city: '', locality: '' }))
    await expect(fetchCityFromCoords(COORDS, fetchImpl)).resolves.toBeNull()
  })

  it('returns null on a network failure rather than throwing', async () => {
    await expect(fetchCityFromCoords(COORDS, failingFetch())).resolves.toBeNull()
  })
})

describe('fetchIpLocation', () => {
  it('extracts city and coordinates from a successful geojs.io response, converting its string lat/long', async () => {
    // GeoJS's real response shape: latitude/longitude are STRINGS, unlike
    // Open-Meteo/BigDataCloud's numeric fields — this is the exact bug that
    // motivated swapping providers being guarded against regressing.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ city: 'Chennai', latitude: '13.08', longitude: '80.27' }))
    await expect(fetchIpLocation(fetchImpl)).resolves.toEqual({
      city: 'Chennai',
      coords: { latitude: 13.08, longitude: 80.27 },
    })
  })

  it('still accepts numeric lat/long directly, not just strings', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ city: 'Chennai', latitude: 13.08, longitude: 80.27 }))
    await expect(fetchIpLocation(fetchImpl)).resolves.toEqual({
      city: 'Chennai',
      coords: { latitude: 13.08, longitude: 80.27 },
    })
  })

  it('returns null coords (not a thrown error) when lat/long are missing or unparseable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ city: 'Chennai' }))
    await expect(fetchIpLocation(fetchImpl)).resolves.toEqual({ city: 'Chennai', coords: null })

    const badFetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ city: 'Chennai', latitude: 'not-a-number', longitude: '80.27' }))
    await expect(fetchIpLocation(badFetchImpl)).resolves.toEqual({ city: 'Chennai', coords: null })
  })

  it('returns city null (not a thrown error) when the field is missing or blank', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ city: '', latitude: '13.08', longitude: '80.27' }))
    await expect(fetchIpLocation(fetchImpl)).resolves.toEqual({
      city: null,
      coords: { latitude: 13.08, longitude: 80.27 },
    })
  })

  it('returns null on a non-ok HTTP response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false))
    await expect(fetchIpLocation(fetchImpl)).resolves.toBeNull()
  })

  it('returns null on a network failure rather than throwing', async () => {
    await expect(fetchIpLocation(failingFetch())).resolves.toBeNull()
  })
})

describe('resolveWeather', () => {
  it('uses geolocation + Open-Meteo + BigDataCloud when permission is granted', async () => {
    const geolocation = {
      getCurrentPosition: (success: PositionCallback) => {
        success({ coords: { latitude: 17.385, longitude: 78.4867 } } as GeolocationPosition)
      },
    }
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('open-meteo')) return Promise.resolve(jsonResponse({ current: { temperature_2m: 30 } }))
      if (url.includes('bigdatacloud')) return Promise.resolve(jsonResponse({ city: 'Hyderabad' }))
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    await expect(resolveWeather({ geolocation, fetchImpl })).resolves.toEqual({
      city: 'Hyderabad',
      temperatureC: 30,
    })
    // geojs.io must never be called on the happy path.
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('geojs.io'))
  })

  it('falls back to IP location when geolocation permission is denied', async () => {
    const geolocation = {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1 } as GeolocationPositionError)
      },
    }
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('geojs.io')) return Promise.resolve(jsonResponse({ city: 'Mumbai', latitude: 19.07, longitude: 72.87 }))
      if (url.includes('open-meteo')) return Promise.resolve(jsonResponse({ current: { temperature_2m: 31 } }))
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    await expect(resolveWeather({ geolocation, fetchImpl })).resolves.toEqual({
      city: 'Mumbai',
      temperatureC: 31,
    })
  })

  it('falls back to IP location when geolocation is unavailable (no navigator.geolocation)', async () => {
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('geojs.io')) return Promise.resolve(jsonResponse({ city: 'Vellore', latitude: 12.92, longitude: 79.13 }))
      if (url.includes('open-meteo')) return Promise.resolve(jsonResponse({ current: { temperature_2m: 27 } }))
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    await expect(resolveWeather({ geolocation: undefined, fetchImpl })).resolves.toEqual({
      city: 'Vellore',
      temperatureC: 27,
    })
  })

  it('falls back to IP location when geolocation succeeds but both its APIs fail', async () => {
    const geolocation = {
      getCurrentPosition: (success: PositionCallback) => {
        success({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition)
      },
    }
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('open-meteo') || url.includes('bigdatacloud')) return Promise.resolve(jsonResponse({}, false))
      if (url.includes('geojs.io')) return Promise.resolve(jsonResponse({ city: 'Chennai', latitude: 13.08, longitude: 80.27 }))
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    await expect(resolveWeather({ geolocation, fetchImpl })).resolves.toEqual({
      city: 'Chennai',
      temperatureC: null,
    })
  })

  it('returns a partial reading when only one of city/temperature resolves', async () => {
    const geolocation = {
      getCurrentPosition: (success: PositionCallback) => {
        success({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition)
      },
    }
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('open-meteo')) return Promise.resolve(jsonResponse({ current: { temperature_2m: 22 } }))
      if (url.includes('bigdatacloud')) return Promise.resolve(jsonResponse({}, false))
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    await expect(resolveWeather({ geolocation, fetchImpl })).resolves.toEqual({
      city: null,
      temperatureC: 22,
    })
  })

  it('returns null when every path fails — geolocation unavailable AND IP lookup fails', async () => {
    const fetchImpl = failingFetch()
    await expect(resolveWeather({ geolocation: undefined, fetchImpl })).resolves.toBeNull()
  })
})
