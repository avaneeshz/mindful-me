import { describe, expect, it } from 'vitest'
import { DEVICE_PROVIDERS, availableDeviceProviders, deviceProviderById } from './deviceProviders'

describe('deviceProviders', () => {
  it('has unique ids', () => {
    const ids = DEVICE_PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every available provider a route and no coming-soon provider one', () => {
    for (const p of DEVICE_PROVIDERS) {
      if (p.availability === 'available') expect(p.route, p.id).toMatch(/^\//)
      else expect(p.route, p.id).toBeUndefined()
    }
  })

  it('keeps the backend provider id for Google Health', () => {
    expect(deviceProviderById('google_health')?.availability).toBe('available')
  })

  it('lists only connectable providers as available', () => {
    expect(availableDeviceProviders().map((p) => p.id)).toEqual(['google_health'])
  })

  it('returns undefined for an unknown provider', () => {
    expect(deviceProviderById('nope')).toBeUndefined()
  })
})
