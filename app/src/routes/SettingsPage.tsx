import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, HeartPulse, Loader2, Plus, Watch, type LucideIcon } from 'lucide-react'
import { apiGetHealthConnectionStatus, type HealthConnectionStatus } from '@/api/healthSync'
import { availableDeviceProviders, type DeviceProvider } from '@/domain/deviceProviders'
import { ParameterVocabularyPanel } from '@/components/activityLibrary/ParameterVocabularyPanel'
import { HIDDEN_ITEMS_ANCHOR, HiddenItemsPanel } from '@/components/settings/HiddenItemsPanel'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/state/AuthContext'
import { useParameterVocabulary } from '@/state/useParameterVocabulary'
import { cn } from '@/lib/utils'

/** Icon per provider — kept here (not in the pure domain module) since it's a rendering concern. */
export const PROVIDER_ICONS: Record<string, LucideIcon> = {
  google_health: HeartPulse,
}

export function providerIcon(id: string): LucideIcon {
  return PROVIDER_ICONS[id] ?? Watch
}

interface ConnectedDevice {
  provider: DeviceProvider
  status: HealthConnectionStatus
}

function statusLabel(status: HealthConnectionStatus): string {
  if (status.status === 'connected') return 'Connected'
  if (status.status === 'needs_reauth') return 'Needs reconnecting'
  return 'Sync problem'
}

/**
 * Settings hub: "Your options" (the per-user quality / chronic symptom /
 * protective response lists every activity picks from — the only place they
 * are added or renamed), "Hidden items" (everything hidden from Today, with
 * Restore) and "Devices & apps" (what's connected, and the entry
 * point to add another, `/settings/devices/add`).
 */
export function SettingsPage() {
  const { configured } = useAuth()
  const [loading, setLoading] = useState(configured)
  const [devices, setDevices] = useState<ConnectedDevice[]>([])
  const vocabulary = useParameterVocabulary()
  const { hash } = useLocation()

  // Arriving from an activity's "Add or rename options in Settings" link, or
  // from a "N hidden · restore in Settings" pointer.
  useEffect(() => {
    if (hash === '#options' || hash === `#${HIDDEN_ITEMS_ANCHOR}`) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
    }
  }, [hash])

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    Promise.all(
      availableDeviceProviders().map(async (provider) => ({
        provider,
        status: await apiGetHealthConnectionStatus(provider.id),
      })),
    ).then((results) => {
      if (cancelled) return
      setDevices(results.filter((r): r is ConnectedDevice => r.status !== null))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [configured])

  return (
    <div className="mb-5xl mx-auto w-full max-w-[640px]">
      <h1 className="font-display text-slot-time font-semibold text-ink">Settings</h1>

      <section id="options" aria-label="Your options" className="mt-2xl scroll-mt-lg">
        <ParameterVocabularyPanel data={vocabulary} />
      </section>

      <section id={HIDDEN_ITEMS_ANCHOR} aria-labelledby="hidden-heading" className="mt-3xl scroll-mt-lg">
        <HiddenItemsPanel />
      </section>

      <section aria-labelledby="devices-heading" className="mt-3xl">
        <div className="flex items-center justify-between gap-md">
          <h2 id="devices-heading" className="text-body font-semibold text-ink">
            Devices &amp; apps
          </h2>
          {configured ? (
            <Link to="/settings/devices/add" className={cn(buttonVariants({ variant: 'primary', size: 'control' }))}>
              <Plus aria-hidden="true" className="size-[16px]" />
              Add device
            </Link>
          ) : null}
        </div>

        {!configured ? (
          <p className="mt-md rounded-md border border-line-soft bg-surface p-lg text-caption text-ink-dim">
            This device is running mindful-me in local-only mode, so there’s nowhere to store a connected account’s data.
            Sign in with a real account to add a device.
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center py-3xl text-ink-dim">
            <Loader2 aria-hidden="true" className="size-[20px] animate-spin" />
            <span className="sr-only">Loading devices…</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="mt-md rounded-md border border-line-soft bg-surface p-2xl text-center">
            <div className="mx-auto flex size-brand items-center justify-center rounded-full bg-ink/[0.06] text-ink">
              <Watch aria-hidden="true" className="size-[24px]" />
            </div>
            <p className="mt-lg text-body font-semibold text-ink">No devices connected</p>
            <p className="mt-xs text-caption text-ink-dim">
              Connect a wearable or health app to see its data alongside your day.
            </p>
          </div>
        ) : (
          <ul className="mt-md flex flex-col gap-sm">
            {devices.map(({ provider, status }) => {
              const Icon = providerIcon(provider.id)
              return (
                <li key={provider.id}>
                  <Link
                    to={provider.route ?? '/settings'}
                    className="flex items-center gap-md rounded-md border border-line-soft bg-surface p-lg transition-colors hover:border-ink"
                  >
                    <span className="flex size-brand shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold text-ink">{provider.name}</span>
                      <span className="block text-caption text-ink-dim">{statusLabel(status)}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-[18px] shrink-0 text-ink-dim" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
