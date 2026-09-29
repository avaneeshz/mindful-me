import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, HeartPulse, Loader2, RefreshCw, RotateCcw, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HealthMetricChart } from '@/components/healthsync/HealthMetricChart'
import { apiListHealthMetrics, type HealthMetricPoint } from '@/api/healthSync'
import { healthDataTypeMeta } from '@/domain/healthMetrics'
import { useHealthConnection } from '@/state/useHealthConnection'
import { formatRelativeTime } from '@/lib/relativeTime'
import { cn } from '@/lib/utils'

const RECENT_WINDOW_DAYS = 30

/**
 * Read-only Health Sync dashboard — Phase-agnostic new feature, entirely
 * separate from the scheduling model. See CLAUDE.md/the agent brief for the
 * approved scope: connect a Google Health account, view every readable
 * category it exposes, never write anything back.
 */
export function HealthSyncPage() {
  const {
    configured,
    status,
    statusLoading,
    summaries,
    summariesLoading,
    connecting,
    connectError,
    recoverable,
    restoring,
    restoreError,
    syncing,
    syncMessage,
    disconnecting,
    connect: handleConnect,
    syncNow: handleSyncNow,
    restore: handleRestore,
    disconnect,
  } = useHealthConnection()

  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)

  const [expandedType, setExpandedType] = useState<string | null>(null)
  const [pointsByType, setPointsByType] = useState<Record<string, HealthMetricPoint[]>>({})
  const [pointsLoadingType, setPointsLoadingType] = useState<string | null>(null)

  async function handleDisconnect() {
    if (await disconnect()) {
      setPointsByType({})
      setExpandedType(null)
      setConfirmingDisconnect(false)
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
          title={recoverable ? 'Reconnect Google Health' : 'Connect Google Health'}
          body={
            recoverable
              ? 'You disconnected Google Health recently. Reconnect the same account without signing in to Google again, or connect a different one.'
              : 'See your steps, heart rate, sleep, and everything else your Fitbit or Pixel Watch account shares — read-only, never edited from here.'
          }
        >
          {recoverable ? (
            <>
              <Button onClick={handleRestore} disabled={restoring}>
                {restoring ? (
                  <Loader2 aria-hidden="true" className="size-[16px] animate-spin" />
                ) : (
                  <RotateCcw aria-hidden="true" className="size-[16px]" />
                )}
                Reconnect
              </Button>
              <Button variant="ghost" onClick={handleConnect} disabled={connecting}>
                Connect a different account
              </Button>
            </>
          ) : (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 aria-hidden="true" className="size-[16px] animate-spin" /> : null}
              Connect Google Health
            </Button>
          )}
          {restoreError ? (
            <p role="alert" className="mt-md text-caption text-ink-dim">
              {restoreError}
            </p>
          ) : null}
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
              <span className="text-caption text-ink-dim">Disconnect? You can reconnect within 30 days.</span>
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
