import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { DEVICE_PROVIDERS } from '@/domain/deviceProviders'
import { providerIcon } from '@/routes/SettingsPage'
import { useAuth } from '@/state/AuthContext'
import { cn } from '@/lib/utils'

/**
 * Step one of connecting a device: pick the provider. Each provider carries
 * its own continuation route (`DeviceProvider.route`), so a new provider with
 * a different sign-in path only needs a catalog entry and a page — this
 * screen doesn't change.
 */
export function AddDevicePage() {
  const { configured } = useAuth()

  return (
    <div className="mb-5xl mx-auto w-full max-w-[640px]">
      <Link
        to="/settings"
        className="inline-flex items-center gap-xs text-caption font-medium text-ink-dim transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-[14px]" />
        Settings
      </Link>
      <h1 className="mt-md font-display text-slot-time font-semibold text-ink">Add a device or app</h1>
      <p className="mt-xs text-caption text-ink-dim">
        Choose where your data lives. You’ll sign in with that account, and mindful-me only reads from it.
      </p>

      {!configured ? (
        <p className="mt-lg rounded-md border border-line-soft bg-surface p-lg text-caption text-ink-dim">
          Sign in with a real account to connect a device.
        </p>
      ) : (
        <ul className="mt-lg flex flex-col gap-sm">
          {DEVICE_PROVIDERS.map((provider) => {
            const Icon = providerIcon(provider.id)
            const available = provider.availability === 'available' && provider.route
            const body = (
              <>
                <span className="flex size-brand shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-sm">
                    <span className="text-body font-semibold text-ink">{provider.name}</span>
                    {!available ? (
                      <span className="rounded-full border border-line px-sm text-micro font-semibold text-ink-dim">
                        Coming soon
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-xs block text-caption text-ink-dim">{provider.description}</span>
                  <span className="mt-xs block text-micro text-ink-dim">
                    Works with {provider.worksWith.join(', ')} · Sign in with {provider.signInWith}
                  </span>
                </span>
                {available ? <ChevronRight aria-hidden="true" className="size-[18px] shrink-0 text-ink-dim" /> : null}
              </>
            )
            const cardClass = 'flex items-start gap-md rounded-md border border-line-soft bg-surface p-lg'
            return (
              <li key={provider.id}>
                {available ? (
                  <Link to={provider.route!} className={cn(cardClass, 'items-center transition-colors hover:border-ink')}>
                    {body}
                  </Link>
                ) : (
                  <div aria-disabled="true" className={cn(cardClass, 'opacity-60')}>
                    {body}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-xl text-micro text-ink-dim">
        Apple Health and Android Health Connect store data on your phone, so they need the mobile app and aren’t
        available yet.
      </p>
    </div>
  )
}
