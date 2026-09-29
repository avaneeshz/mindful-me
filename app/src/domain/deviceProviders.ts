/**
 * The catalog of devices/apps a person can connect from Settings → Devices.
 * Pure data + lookup — no React, no state, matching this repo's domain-layer
 * convention.
 *
 * Only "cloud account" providers live here: ones a person connects by
 * signing in to the vendor's own account (OAuth), so a web app can pull the
 * data server-side. Apple Health and Android Health Connect are deliberately
 * absent — that data lives on the phone and needs a mobile companion app,
 * which this product doesn't have yet.
 */

export type ProviderAvailability = 'available' | 'coming_soon'

export interface DeviceProvider {
  /** Also the `provider` value the backend stores connections under. */
  id: string
  name: string
  /** One line: what connecting this gives the person. */
  description: string
  /** What the person signs in with — shown so the path is clear before they leave the app. */
  signInWith: string
  /** Devices/apps whose data arrives through this provider. */
  worksWith: string[]
  availability: ProviderAvailability
  /** In-app route that continues the connect flow. Present only when `available`. */
  route?: string
}

export const DEVICE_PROVIDERS: DeviceProvider[] = [
  {
    id: 'google_health',
    name: 'Fitbit & Google Health',
    description: 'Steps, sleep, heart rate and more from your Fitbit or Pixel Watch, through your Google account.',
    signInWith: 'Google account',
    worksWith: ['Fitbit', 'Pixel Watch', 'Google Health app'],
    availability: 'available',
    route: '/health-sync',
  },
]

const BY_ID = new Map(DEVICE_PROVIDERS.map((p) => [p.id, p]))

export function deviceProviderById(id: string): DeviceProvider | undefined {
  return BY_ID.get(id)
}

/** Providers a person can connect today. */
export function availableDeviceProviders(): DeviceProvider[] {
  return DEVICE_PROVIDERS.filter((p) => p.availability === 'available')
}
