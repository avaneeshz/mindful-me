import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiListHealthMetrics } from '@/api/healthSync'
import { describeHealthValue } from '@/domain/healthMetrics'

/** Profile or settings: the latest snapshot as a plain list — there is no series to chart. */
export function AccountCard({ dataType, title, refreshKey }: { dataType: 'profile' | 'settings'; title: string; refreshKey: number }) {
  const [lines, setLines] = useState<Array<{ label: string; text: string }> | null>(null)

  useEffect(() => {
    let cancelled = false
    const end = new Date(Date.now() + 24 * 3600_000)
    const start = new Date(end.getTime() - 30 * 24 * 3600_000)
    apiListHealthMetrics(dataType, start, end).then((points) => {
      if (cancelled) return
      const latest = [...(points ?? [])].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))[0]
      setLines(latest ? describeHealthValue(latest.value, 20) : [])
    })
    return () => {
      cancelled = true
    }
  }, [dataType, refreshKey])

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
