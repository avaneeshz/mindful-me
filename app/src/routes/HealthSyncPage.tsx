import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, HeartPulse, Loader2, RefreshCw, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HealthMetricChart } from '@/components/healthsync/HealthMetricChart'
import {
  apiDisconnectHealthConnection,
  apiGetHealthConnectionStatus,
  apiListHealthDataTypeSummaries,
  apiListHealthMetrics,
  apiTriggerHealthSync,
  type HealthConnectionStatus,
  type HealthDataTypeSummary,
  type HealthMetricPoint,
} from '@/api/healthSync'
import { healthDataTypeMeta } from '@/domain/healthMetrics'
import { beginGoogleHealthOAuthState, buildGoogleHealthAuthorizeUrl } from '@/lib/googleHealthOAuth'
import { useAuth } from '@/state/AuthContext'
import { cn } from '@/lib/utils'

const RECENT_WINDOW_DAYS = 30

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/**
 * Read-only Health Sync dashboard — Phase-agnostic new feature, entirely
 * separate from the scheduling model. See CLAUDE.md/the agent brief for the
 * approved scope: connect a Google Health account, view every readable
 * category it exposes, never write anything back.
 */
export function HealthSyncPage() {
  const { configured } = useAuth()

  const [status, setStatus] = useState<HealthConnectionStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [summaries, setSummaries] = useState<HealthDataTypeSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)

  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const [expandedType, setExpandedType] = useState<string | null>(null)
  const [pointsByType, setPointsByType] = useState<Record<string, HealthMetricPoint[]>>({})
  const [pointsLoadingType, setPointsLoadingType] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const nextStatus = await apiGetHealthConnectionStatus()
    setStatus(nextStatus)
    setStatusLoading(false)
    if (nextStatus?.status === 'connected') {
      setSummariesLoading(true)
      const nextSummaries = await apiListHealthDataTypeSummaries()
      setSummaries(nextSummaries ?? [])
      setSummariesLoading(false)
    } else {
      setSummaries([])
    }
  }, [])

  useEffect(() => {
    if (!configured) {
      setStatusLoading(false)
      return
    }
    refresh()
  }, [configured, refresh])

  function handleConnect() {
    const clientId = import.meta.env.VITE_GOOGLE_HEALTH_CLIENT_ID as string | undefined
    if (!clientId) {
      setConnectError('Google Health isn’t configured for this environment yet — the OAuth client ID is missing.')
      return
    }
    setConnectError(null)
    setConnecting(true)
    const state = beginGoogleHealthOAuthState()
    window.location.href = buildGoogleHealthAuthorizeUrl(clientId, state)
  }

  async function handleSyncNow() {
    if (syncing) return // rule 9's spirit — guard against a double-submit
    setSyncing(true)
    setSyncMessage(null)
    const result = await apiTriggerHealthSync()
    setSyncing(false)
    if (result.ok) {
      setSyncMessage({ tone: 'success', text: `Synced ${result.pointsSynced ?? 0} new data point${result.pointsSynced === 1 ? '' : 's'}.` })
      refresh()
    } else if (result.reason === 'reauth_required') {
      await refresh()
    } else {
      setSyncMessage({ tone: 'error', text: result.message ?? 'Sync failed. Try again in a moment.' })
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await apiDisconnectHealthConnection()
      setStatus(null)
      setSummaries([])
      setPointsByType({})
      setExpandedType(null)
      setConfirmingDisconnect(false)
    } catch {
      setSyncMessage({ tone: 'error', text: 'Could not disconnect — try again.' })
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleToggleExpand(dataType: string) {
    if (expandedType === dataType) {
      setExpandedType(null)
      return
    }
    setExpandedType(dataType)
    if (!pointsByType[dataType]) {
      setPointsLoadingType(dataType)
      const end = new Date()
      const start = new Date(end.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      const rows = await apiListHealthMetrics(dataType, start, end)
      setPointsByType((prev) => ({ ...prev, [dataType]: rows ?? [] }))
      setPointsLoadingType(null)
    }
  }

  // ---------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------

  if (!configured) {
    return (
      <PageShell>
        <EmptyStateCard
          icon={<HeartPulse aria-hidden="true" className="size-[28px]" />}
          title="Health Sync requires an account"
          body="This device is running mindful-me in local-only mode (no backend configured), so there's nowhere to store a connected account's data. Sign in with a real account to use Health Sync."
        />
      </PageShell>
    )
  }

  if (statusLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-5xl text-ink-dim">
          <Loader2 aria-hidden="true" className="size-[24px] animate-spin" />
          <span className="sr-only">Loading Health Sync…</span>
        </div>
      </PageShell>
    )
  }

  if (!status) {
    return (
      <PageShell>
        <EmptyStateCard
          icon={<HeartPulse aria-hidden="true" className="size-[28px]" />}
          title="Connect Google Health"
          body="See your steps, heart rate, sleep, and everything else your Fitbit or Pixel Watch account shares — read-only, never edited from here."
        >
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? <Loader2 aria-hidden="true" className="size-[16px] animate-spin" /> : null}
            Connect Google Health
          </Button>
          {connectError ? (
            <p role="alert" className="mt-md text-caption text-ink-dim">
              {connectError}
            </p>
          ) : null}
        </EmptyStateCard>
      </PageShell>
    )
  }

  if (status.status === 'needs_reauth' || status.status === 'error') {
    return (
      <PageShell>
        <EmptyStateCard
          icon={<AlertTriangle aria-hidden="true" className="size-[28px]" />}
          title={status.status === 'needs_reauth' ? 'Reconnect Google Health' : 'Something went wrong'}
          body={
            status.lastError ??
            (status.status === 'needs_reauth'
              ? 'Your Google Health connection needs to be re-authorized.'
              : 'The last sync ran into a problem.')
          }
        >
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? <Loader2 aria-hidden="true" className="size-[16px] animate-spin" /> : null}
            Reconnect Google Health
          </Button>
          {connectError ? (
            <p role="alert" className="mt-md text-caption text-ink-dim">
              {connectError}
            </p>
          ) : null}
        </EmptyStateCard>
      </PageShell>
    )
  }

  // status.status === 'connected'
  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-lg">
        <div>
          <h1 className="font-display text-slot-time font-semibold text-ink">Health Sync</h1>
          <p className="mt-xs text-caption text-ink-dim">
            Connected · {status.scopes.length} categories granted · last synced {formatRelativeTime(status.lastSyncedAt)}
          </p>
        </div>
        <div className="flex items-center gap-md">
          <Button variant="outline" size="control" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? (
              <Loader2 aria-hidden="true" className="size-[16px] animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-[16px]" />
            )}
            Sync now
          </Button>
          {confirmingDisconnect ? (
            <div className="flex items-center gap-sm">
              <span className="text-caption text-ink-dim">Disconnect?</span>
              <Button variant="destructive" size="inline" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
              </Button>
              <Button variant="ghost" size="inline" onClick={() => setConfirmingDisconnect(false)} disabled={disconnecting}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="control" onClick={() => setConfirmingDisconnect(true)}>
              <Unplug aria-hidden="true" className="size-[16px]" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {syncMessage ? (
        <p
          role="status"
          className={cn(
            'mt-lg flex items-center gap-sm text-caption',
            syncMessage.tone === 'success' ? 'text-ink-dim' : 'text-ink',
          )}
        >
          {syncMessage.tone === 'success' ? (
            <CheckCircle2 aria-hidden="true" className="size-[14px]" />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-[14px]" />
          )}
          {syncMessage.text}
        </p>
      ) : null}

      <div className="mt-2xl">
        {summariesLoading ? (
          <div className="flex items-center justify-center py-3xl text-ink-dim">
            <Loader2 aria-hidden="true" className="size-[20px] animate-spin" />
            <span className="sr-only">Loading synced categories…</span>
          </div>
        ) : summaries.length === 0 ? (
          <EmptyStateCard
            icon={<RefreshCw aria-hidden="true" className="size-[24px]" />}
            title="No data synced yet"
            body="The first sync runs automatically right after connecting — it can take a few minutes. You can also trigger one yourself."
          >
            <Button onClick={handleSyncNow} disabled={syncing}>
              {syncing ? <Loader2 aria-hidden="true" className="size-[16px] animate-spin" /> : null}
              Sync now
            </Button>
          </EmptyStateCard>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-lg mobile:grid-cols-1">
            {summaries.map((summary) => {
              const meta = healthDataTypeMeta(summary.dataType)
              const isExpanded = expandedType === summary.dataType
              const points = pointsByType[summary.dataType]
              const isLoadingPoints = pointsLoadingType === summary.dataType
              return (
                <li key={summary.dataType} className="rounded-md border border-line-soft bg-surface p-lg">
                  <button
                    type="button"
                    onClick={() => handleToggleExpand(summary.dataType)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between gap-md text-left"
                  >
                    <div>
                      <div className="text-body font-semibold text-ink">{meta.label}</div>
                      <div className="mt-xs text-caption text-ink-dim">
                        {summary.pointCountRecent} point{summary.pointCountRecent === 1 ? '' : 's'} in the last 30 days
                        {summary.latestRecordedAt ? ` · latest ${formatRelativeTime(summary.latestRecordedAt)}` : ''}
                      </div>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn('size-[18px] shrink-0 text-ink-dim transition-transform', isExpanded && 'rotate-180')}
                    />
                  </button>
                  {isExpanded ? (
                    <div className="mt-lg">
                      {isLoadingPoints ? (
                        <div className="flex h-[180px] items-center justify-center text-ink-dim">
                          <Loader2 aria-hidden="true" className="size-[20px] animate-spin" />
                          <span className="sr-only">Loading {meta.label}…</span>
                        </div>
                      ) : (
                        <HealthMetricChart points={points ?? []} meta={meta} />
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mb-5xl">{children}</div>
}

function EmptyStateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto mt-3xl max-w-[480px] rounded-md border border-line-soft bg-surface p-2xl text-center">
      <div className="mx-auto flex size-brand items-center justify-center rounded-full bg-ink/[0.06] text-ink">{icon}</div>
      <h1 className="mt-lg font-display text-slot-time font-semibold text-ink">{title}</h1>
      <p className="mt-sm text-caption text-ink-dim">{body}</p>
      {children ? <div className="mt-lg flex flex-col items-center gap-sm">{children}</div> : null}
    </div>
  )
}
