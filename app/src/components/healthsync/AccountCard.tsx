import { Loader2 } from 'lucide-react'
import { latestHealthDetails } from '@/domain/healthMetrics'
import { useHealthMetrics } from '@/state/useHealthMetrics'

/** Profile or settings: the latest snapshot as a plain list — there is no series to chart. */
export function AccountCard({ dataType, title, refreshKey }: { dataType: 'profile' | 'settings'; title: string; refreshKey: number }) {
  const points = useHealthMetrics(dataType, { days: 30, refreshKey })
  const lines = points === null ? null : latestHealthDetails(points)

  return (
    <li className="rounded-md border border-line-soft bg-surface p-lg">
      <div className="text-body font-semibold text-ink">{title}</div>
      {lines === null ? (
        <div className="mt-md flex justify-center text-ink-dim">
          <Loader2 aria-hidden="true" className="size-[18px] animate-spin" />
          <span className="sr-only">Loading {title}…</span>
        </div>
      ) : lines.length === 0 ? (
        <p className="mt-xs text-caption text-ink-dim">Nothing synced yet.</p>
      ) : (
        <dl className="mt-md grid grid-cols-[auto_1fr] gap-x-lg gap-y-xs text-caption">
          {lines.map((l) => (
            <div key={l.label} className="contents">
              <dt className="text-ink-dim">{l.label}</dt>
              <dd className="text-ink">{l.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}
