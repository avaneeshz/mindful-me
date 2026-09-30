import { Activity, AlertTriangle, CheckCircle2, HeartPulse, Loader2, Plus, RefreshCw, RotateCcw, Unplug, Watch } from 'lucide-react'
import { useState } from 'react'
import { DEVICE_PROVIDERS, deviceProviderById } from '@/domain/deviceProviders'
import { formatRelativeTime } from '@/lib/relativeTime'
import { Button } from '@/lumen/components/ui/button'
import { EmptyState } from '@/lumen/components/ui/primitives'
import { useStore } from '@/lumen/lib/store'
import { useHealthConnection } from '@/state/useHealthConnection'
import { EditRow, Group, Notice, SettingsPage, SmallIcon } from './parts'

const PROVIDER_ICON = { google_health: HeartPulse } as const

const NOT_SIGNED_IN =
  'This device is running in local-only mode, so there’s nowhere to store a connected account’s data. Sign in with a real account to add a device.'

/**
 * Settings → Devices & apps: what's connected, the manage actions, and the way
 * into the synced data (Health data). Same connection state and actions as Classic's Health Sync
 * page (`useHealthConnection`) — only the presentation differs.
 */
export function DevicesScreen({ onBack }: { onBack: () => void }) {
  const { openSettings } = useStore()
  const h = useHealthConnection()
  const [confirming, setConfirming] = useState(false)
  const provider = deviceProviderById('google_health')!

  const addButton = h.configured ? (
    <Button variant="primary" onClick={() => openSettings('devices-add')}>
      <Plus className="h-4 w-4" />
      Add device
    </Button>
  ) : undefined

  let body: React.ReactNode
  if (!h.configured) {
    body = <Notice>{NOT_SIGNED_IN}</Notice>
  } else if (h.statusLoading) {
    body = (
      <div className="flex justify-center py-10 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading devices…</span>
      </div>
    )
  } else if (!h.status) {
    body = (
      <Group>
        <EmptyState
          icon={Watch}
          title={h.recoverable ? 'Reconnect Fitbit & Google Health' : 'No devices connected'}
          body={
            h.recoverable
              ? 'You disconnected it recently. Reconnect the same account without signing in to Google again.'
              : 'Connect a wearable or health app to see its data alongside your day.'
          }
          action={
            h.recoverable ? (
              <Button variant="primary" onClick={h.restore} disabled={h.restoring}>
                {h.restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reconnect
              </Button>
            ) : (
              <Button variant="primary" onClick={() => openSettings('devices-add')}>
                <Plus className="h-4 w-4" />
                Add device
              </Button>
            )
          }
        />
        {h.restoreError && <p role="alert" className="px-4 pb-4 text-center text-sm text-ink-muted">{h.restoreError}</p>}
      </Group>
    )
  } else {
    const { status } = h
    const problem = status.status !== 'connected'
    body = (
      <>
        <Group>
          <EditRow
            lead={<SmallIcon icon={problem ? AlertTriangle : PROVIDER_ICON.google_health} />}
            label={provider.name}
            hint={
              problem
                ? (status.lastError ??
                  (status.status === 'needs_reauth' ? 'Needs to be re-authorized' : 'The last sync ran into a problem'))
                : `Connected · last synced ${formatRelativeTime(status.lastSyncedAt)}`
            }
          />
        </Group>

        <div className="flex flex-wrap gap-2">
          {problem ? (
            <Button variant="primary" onClick={h.connect} disabled={h.connecting}>
              {h.connecting && <Loader2 className="h-4 w-4 animate-spin" />}
              Reconnect
            </Button>
          ) : (
            <Button onClick={h.syncNow} disabled={h.syncing}>
              {h.syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </Button>
          )}
          {!confirming && (
            <Button onClick={() => setConfirming(true)}>
              <Unplug className="h-4 w-4" />
              Disconnect
            </Button>
          )}
        </div>

        {confirming && (
          <Notice>
            Disconnect {provider.name}? You can reconnect within 30 days.
            <span className="mt-3 flex gap-2">
              <Button
                onClick={async () => {
                  if (await h.disconnect()) setConfirming(false)
                }}
                disabled={h.disconnecting}
              >
                {h.disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={h.disconnecting}>
                Cancel
              </Button>
            </span>
          </Notice>
        )}

        {h.syncProgress && (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Syncing… {h.syncProgress.done} of {h.syncProgress.total}
          </p>
        )}
        {h.syncMessage && (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
            {h.syncMessage.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            )}
            {h.syncMessage.text}
          </p>
        )}
        {h.connectError && <Notice>{h.connectError}</Notice>}

        {!problem && (
          <Group title="Your data">
            <EditRow
              lead={<SmallIcon icon={Activity} />}
              label="Health data"
              hint={
                h.summariesLoading
                  ? 'Heart rate, sleep, activity and more'
                  : h.summaries.length === 0
                    ? 'Nothing synced yet'
                    : `Heart rate through the day and ${h.summaries.length} synced ${h.summaries.length === 1 ? 'category' : 'categories'}`
              }
              onOpen={() => openSettings('health-data')}
            />
          </Group>
        )}
      </>
    )
  }

  return (
    <SettingsPage eyebrow="Settings" title="Devices & apps" onBack={onBack} action={addButton}>
      {body}
    </SettingsPage>
  )
}

/** Step one of connecting: pick the provider. Choosing one starts its own sign-in. */
export function AddDeviceScreen({ onBack }: { onBack: () => void }) {
  const { openSettings } = useStore()
  const h = useHealthConnection()

  return (
    <SettingsPage eyebrow="Devices & apps" title="Add a device or app" onBack={onBack}>
      <p className="-mt-2 text-sm text-ink-muted">
        Choose where your data lives. You’ll sign in with that account, and mindful-me only reads from it.
      </p>
      {!h.configured ? (
        <Notice>{NOT_SIGNED_IN}</Notice>
      ) : (
        <Group>
          {DEVICE_PROVIDERS.map((provider) => {
            const connected = h.status?.status === 'connected'
            return (
              <EditRow
                key={provider.id}
                lead={<SmallIcon icon={PROVIDER_ICON.google_health} />}
                label={provider.name}
                hint={connected ? 'Already connected' : `Works with ${provider.worksWith.join(', ')} · Sign in with ${provider.signInWith}`}
                onOpen={h.connecting ? undefined : connected ? () => openSettings('devices') : h.connect}
              />
            )
          })}
        </Group>
      )}
      {h.connecting && (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Taking you to Google…
        </p>
      )}
      {h.connectError && <Notice>{h.connectError}</Notice>}
      <p className="text-xs text-ink-faint">
        Apple Health and Android Health Connect store data on your phone, so they need the mobile app and aren’t
        available yet.
      </p>
    </SettingsPage>
  )
}
