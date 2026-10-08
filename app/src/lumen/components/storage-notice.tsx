import { TriangleAlert } from 'lucide-react'
import { useStorageWarnings } from '@/state/useStorageWarnings'
import { Button } from '@/lumen/components/ui/button'
import { useStore } from '@/lumen/lib/store'
import { cn } from '@/lumen/lib/utils'

/** Lumen's face for the same warnings as Classic's `StorageNotice` — rules in `state/storageWarnings.ts`. */
export function StorageNotice() {
  const warnings = useStorageWarnings()
  const { openSettings } = useStore()
  if (warnings.length === 0) return null
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[640px] flex-col gap-2">
      {warnings.map((warning) => (
        <div
          key={warning.id}
          role={warning.severity === 'urgent' ? 'alert' : 'status'}
          className={cn('surface flex items-start gap-3 rounded-card p-4', warning.severity === 'urgent' && 'border border-danger/40')}
        >
          <TriangleAlert
            aria-hidden="true"
            className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', warning.severity === 'urgent' ? 'text-danger' : 'text-ink-muted')}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-ink">{warning.title}</p>
            <p className="mt-1 text-xs text-ink-muted">{warning.body}</p>
            <Button variant="ghost" className="-ml-3 mt-1" onClick={() => openSettings('needs-attention')}>
              See what’s waiting
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
