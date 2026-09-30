import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, HeartPulse, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { HealthDataTypeSummary } from '@/api/healthSync'
import { HealthMetricChart } from '@/components/healthsync/HealthMetricChart'
import { HeartRateDayChart } from '@/components/healthsync/HeartRateDayChart'
import { describeHealthValue, healthDataTypeMeta, latestHealthDetails, READABLE_HEALTH_GROUPS } from '@/domain/healthMetrics'
import { formatRelativeTime } from '@/lib/relativeTime'
import { Button } from '@/lumen/components/ui/button'
import { EmptyState } from '@/lumen/components/ui/primitives'
import { LUMEN_CHART_PALETTE } from '@/lumen/lib/healthChartPalette'
import { cn } from '@/lumen/lib/utils'
import { useHealthConnection } from '@/state/useHealthConnection'
import { useHealthMetrics, useHeartRateDays } from '@/state/useHealthMetrics'
import { Group, Notice, SettingsPage } from './parts'

const HISTORY_DAYS = 30
const ENTRY_LIMIT = 6

/**
 * Settings → Devices & apps → Health data. Lumen's view of everything the
 * Google Health sync stores: the whole day's heart rate with a day picker, then
 * one section per permission group. Same data and hooks as Classic's Health
 * Sync page; only the presentation is Lumen's.
 */
export function HealthDataScreen({ onBack }: { onBack: () => void }) {
  const h = useHealthConnection()
  // Changes whenever a sync lands, so everything below re-reads.
  const refreshKey = h.status?.lastSyncedAt ? Date.parse(h.status.lastSyncedAt) : 0
  const connected = h.status?.status === 'connected'

  const syncButton = connected ? (
    <Button onClick={h.syncNow} disabled={h.syncing} aria-label="Sync now">
      {h.syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      <span className="hidden sm:inline">Sync now</span>
    </Button>
  ) : undefined

  let body: React.ReactNode
  if (!h.configured) {
    body = <Notice>You’re not signed in to an account, so there’s no synced health data on this device.</Notice>
  } else if (h.statusLoading) {
    body = <Spinner label="Loading health data…" />
  } else if (!connected) {
    body = (
      <Group>
        <EmptyState
          icon={HeartPulse}
          title="No device connected"
          body="Connect Fitbit & Google Health from Devices & apps to see your data here."
          action={<Button variant="primary" onClick={onBack}>Devices & apps</Button>}
        />
      </Group>
    )
  } else {
    const { status } = h
    body = (
      <>
        <p className="-mt-2 text-sm text-ink-muted">Last synced {formatRelativeTime(status!.lastSyncedAt)}</p>

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

        <HeartRateCard refreshKey={refreshKey} />

        {h.summariesLoading ? (
          <Spinner label="Loading synced categories…" />
        ) : h.summaries.length === 0 ? (
          <Group>
            <EmptyState
              icon={RefreshCw}
              title="No data synced yet"
              body="The first sync can take a minute or two. You can start one with Sync now."
            />
          </Group>
        ) : (
          READABLE_HEALTH_GROUPS.map((group) => {
            const inGroup = h.summaries.filter((s) => {
              const meta = healthDataTypeMeta(s.dataType)
              return meta.group === group.id && meta.view !== 'intraday'
            })
            return (
              <Group key={group.id} title={group.label}>
                {inGroup.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-faint">
                    {group.id === 'location'
                      ? 'Only used when an exercise route is exported. Nothing is stored.'
                      : 'Nothing from your device yet. Not every device records this.'}
                  </p>
                ) : (
                  inGroup.map((summary) =>
                    healthDataTypeMeta(summary.dataType).view === 'account' ? (
                      <AccountRow key={summary.dataType} summary={summary} refreshKey={refreshKey} />
                    ) : (
                      <TypeRow key={summary.dataType} summary={summary} refreshKey={refreshKey} />
                    ),
                  )
                )}
              </Group>
            )
          })
        )}
      </>
    )
  }

  return (
    <SettingsPage eyebrow="Devices & apps" title="Health data" onBack={onBack} backLabel="Back to Devices & apps" action={syncButton}>
      {body}
    </SettingsPage>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-8 text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

/** The whole day's heart rate, one point per minute, with a day picker over the last two weeks. */
function HeartRateCard({ refreshKey }: { refreshKey: number }) {
  const days = useHeartRateDays({ days: HISTORY_DAYS, refreshKey })
  const [selected, setSelected] = useState(0)
  const count = days?.length ?? 0
  useEffect(() => setSelected(Math.max(0, count - 1)), [count])
  const day = days?.[selected]

  return (
    <section aria-labelledby="lm-hr-day" className="surface rounded-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="lm-hr-day" className="flex items-center gap-2 text-[15px] text-ink">
          <HeartPulse className="h-[18px] w-[18px] text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
          Heart rate
        </h2>
        {day && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous day" disabled={selected <= 0} onClick={() => setSelected((i) => i - 1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="min-w-[96px] text-center text-sm text-ink" aria-live="polite">
              {day.label}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next day"
              disabled={selected >= count - 1}
              onClick={() => setSelected((i) => i + 1)}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {days === null ? (
        <Spinner label="Loading heart rate…" />
      ) : !day ? (
        <p className="py-6 text-center text-sm text-ink-faint">No heart-rate readings synced yet.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {(
              [
                ['Lowest', day.data.min],
                ['Average', day.data.avg],
                ['Highest', day.data.max],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-control bg-white/[0.03] py-2">
                <dt className="text-xs text-ink-faint">{label}</dt>
                <dd className="text-base font-medium tabular text-ink">{Math.round(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3">
            <HeartRateDayChart data={day.data} dayLabel={day.label} palette={LUMEN_CHART_PALETTE} height={200} />
          </div>
          <p className="mt-2 text-xs text-ink-faint">bpm · one reading per minute</p>
        </>
      )}
    </section>
  )
}

/** One data type: a row that opens to its chart (and, for logged entries, the latest few). */
function TypeRow({ summary, refreshKey }: { summary: HealthDataTypeSummary; refreshKey: number }) {
  const meta = healthDataTypeMeta(summary.dataType)
  const [open, setOpen] = useState(false)
  const points = useHealthMetrics(summary.dataType, { days: 30, enabled: open, refreshKey })
  const panelId = `lm-health-${summary.dataType}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-ink">{meta.label}</span>
          <span className="block truncate text-xs text-ink-faint">
            {summary.pointCountRecent} in the last 30 days
            {summary.latestRecordedAt ? ` · latest ${formatRelativeTime(summary.latestRecordedAt)}` : ''}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4">
          {points === null ? (
            <Spinner label={`Loading ${meta.label}…`} />
          ) : (
            <>
              <HealthMetricChart points={points} meta={meta} palette={LUMEN_CHART_PALETTE} />
              {meta.dayAggregate === 'count' && <Entries points={points} />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Entries({ points }: { points: Array<{ id: string; recordedAt: string; value: unknown }> }) {
  const latest = [...points].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1)).slice(0, ENTRY_LIMIT)
  if (latest.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {latest.map((p) => {
        const lines = describeHealthValue(p.value)
        return (
          <li key={p.id} className="rounded-control bg-white/[0.03] px-3 py-2 text-sm">
            <p className="text-ink">{new Date(p.recordedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
            {lines.length > 0 && <DetailList lines={lines} />}
          </li>
        )
      })}
    </ul>
  )
}

/** Profile or settings: the latest snapshot as label–value lines. There is nothing to chart. */
function AccountRow({ summary, refreshKey }: { summary: HealthDataTypeSummary; refreshKey: number }) {
  const meta = healthDataTypeMeta(summary.dataType)
  const points = useHealthMetrics(summary.dataType, { days: 30, refreshKey })
  const lines = points === null ? null : latestHealthDetails(points)
  return (
    <div className="px-4 py-3">
      <p className="text-[15px] text-ink">{meta.label}</p>
      {lines === null ? (
        <Spinner label={`Loading ${meta.label}…`} />
      ) : lines.length === 0 ? (
        <p className="text-xs text-ink-faint">Nothing synced yet.</p>
      ) : (
        <DetailList lines={lines} />
      )}
    </div>
  )
}

function DetailList({ lines }: { lines: Array<{ label: string; text: string }> }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
      {lines.map((l) => (
        <div key={l.label} className="contents">
          <dt className="text-ink-faint">{l.label}</dt>
          <dd className="break-words text-ink-muted">{l.text}</dd>
        </div>
      ))}
    </dl>
  )
}
