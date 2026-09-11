import { AlertTriangle, CloudUpload } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import { describeSyncIndicator, type SyncQueue } from '@/state/syncQueue'
import { cn } from '@/lib/utils'

/**
 * Bug B (write-failure-visibility incident) — background sync used to be
 * mute-and-invisible: a failed write logged a `console.warn` and nothing on
 * screen ever said so. This is the persistent, visible signal the product
 * owner mandated — "not a toast that disappears, something that stays until
 * it resolves." It renders NOTHING while every write is either synced or has
 * never needed to leave the device unconfirmed for long enough to matter
 * (see `describeSyncIndicator`'s own doc comment for why "hidden" is
 * deliberate, not a missing state) — it only earns a place in the header once
 * there's something true and useful to say, and then it stays exactly as
 * long as that stays true, never on a timer.
 *
 * Deliberately visible at every width, unlike `WeatherPill` (`mobile:hidden`
 * there is fine — losing sight of the temperature costs nothing; losing sight
 * of "this hasn't saved yet" on the device most likely to have a flaky
 * connection would not be).
 */
export function SyncStatusPill({
  queue,
  onRetryNow,
  className,
}: {
  queue: SyncQueue
  onRetryNow: () => void
  className?: string
}) {
  const indicator = describeSyncIndicator(queue)

  if (indicator.kind === 'hidden') return null

  const isFailed = indicator.kind === 'failed'
  const label =
    indicator.count === 1
      ? isFailed
        ? "Couldn't sync 1 change"
        : 'Saving 1 change…'
      : isFailed
        ? `Couldn't sync ${indicator.count} changes`
        : `Saving ${indicator.count} changes…`

  return (
    <Chip
      size="sm"
      className={cn(isFailed && 'border-ink/30', className)}
      role="status"
      aria-live="polite"
    >
      {isFailed ? (
        <AlertTriangle aria-hidden="true" className="size-[14px] text-ink-dim" />
      ) : (
        <CloudUpload aria-hidden="true" className="size-[14px] text-ink-dim" />
      )}
      <span>{label}</span>
      {isFailed && (
        <button
          type="button"
          onClick={onRetryNow}
          className="rounded-sm font-semibold text-ink underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          aria-label={`Retry syncing now — ${label}`}
        >
          Retry now
        </button>
      )}
    </Chip>
  )
}
