import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStorageWarnings } from '@/state/useStorageWarnings'
import { cn } from '@/lib/utils'

/**
 * Tells the user — only when it matters — that changes waiting to sync could
 * be lost. Silent for anyone whose changes have all reached their account; the
 * rules live in `state/storageWarnings.ts`.
 */
export function StorageNotice({ className }: { className?: string }) {
  const warnings = useStorageWarnings()
  if (warnings.length === 0) return null
  return (
    <div className={cn('flex flex-col gap-sm', className)}>
      {warnings.map((warning) => (
        <div
          key={warning.id}
          role={warning.severity === 'urgent' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-md rounded-md border bg-surface p-lg',
            warning.severity === 'urgent' ? 'border-ink' : 'border-line-soft',
          )}
        >
          <TriangleAlert aria-hidden="true" className="mt-[2px] size-[18px] shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink">{warning.title}</p>
            <p className="mt-xs text-caption text-ink-dim">{warning.body}</p>
            <Link
              to="/settings/not-synced"
              className="mt-sm inline-block text-caption font-medium text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              See what’s waiting
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
