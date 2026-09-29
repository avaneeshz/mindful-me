import { useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { apiListHealthMetrics, type HealthDataTypeSummary, type HealthMetricPoint } from '@/api/healthSync'
import { describeHealthValue, healthDataTypeMeta } from '@/domain/healthMetrics'
import { HealthMetricChart } from '@/components/healthsync/HealthMetricChart'
import { formatRelativeTime } from '@/lib/relativeTime'
import { cn } from '@/lib/utils'

const RECENT_WINDOW_DAYS = 30
const DETAIL_LIMIT = 8

/** Newest first, most recent `DETAIL_LIMIT` — the entries behind an event chart. */
function EntryList({ points }: { points: HealthMetricPoint[] }) {
  const latest = [...points].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1)).slice(0, DETAIL_LIMIT)
  if (latest.length === 0) return null
  return (
    <ul className="mt-md flex flex-col gap-sm">
      {latest.map((p) => {
        const lines = describeHealthValue(p.value)
        return (
          <li key={p.id} className="rounded-md bg-ink/[0.04] px-md py-sm text-caption">
            <div className="font-semibold text-ink">
              {new Date(p.recordedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            {lines.length > 0 ? (
              <dl className="mt-xs grid grid-cols-[auto_1fr] gap-x-md gap-y-xs text-ink-dim">
                {lines.map((l) => (
                  <div key={l.label} className="contents">
                    <dt>{l.label}</dt>
                    <dd className="text-ink">{l.text}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * One data type as an expandable card: its chart over the last 30 days, and —
 * for entry-style types (symptoms, moods, periods…) — the entries behind it.
 * Loads its own points the first time it opens (rule 8: a bounded window).
 */
export function HealthTypeCard({ summary }: { summary: HealthDataTypeSummary }) {
  const meta = healthDataTypeMeta(summary.dataType)
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState<HealthMetricPoint[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && points === null) {
      setLoading(true)
      const end = new Date()
      const start = new Date(end.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      setPoints((await apiListHealthMetrics(summary.dataType, start, end)) ?? [])
      setLoading(false)
    }
  }

  return (
    <li className="rounded-md border border-line-soft bg-surface p-lg">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-md text-left">
        <div>
          <div className="text-body font-semibold text-ink">{meta.label}</div>
          <div className="mt-xs text-caption text-ink-dim">
            {summary.pointCountRecent} point{summary.pointCountRecent === 1 ? '' : 's'} in the last 30 days
            {summary.latestRecordedAt ? ` · latest ${formatRelativeTime(summary.latestRecordedAt)}` : ''}
          </div>
        </div>
        <ChevronDown aria-hidden="true" className={cn('size-[18px] shrink-0 text-ink-dim transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="mt-lg">
          {loading || points === null ? (
            <div className="flex h-[180px] items-center justify-center text-ink-dim">
              <Loader2 aria-hidden="true" className="size-[20px] animate-spin" />
              <span className="sr-only">Loading {meta.label}…</span>
            </div>
          ) : (
            <>
              <HealthMetricChart points={points} meta={meta} />
              {meta.dayAggregate === 'count' ? <EntryList points={points} /> : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  )
}
