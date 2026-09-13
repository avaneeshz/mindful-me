import { CloudAlert, CloudCheck, CloudUpload } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import { describeSyncIndicator, type SyncQueue } from '@/state/syncQueue'
import { cn } from '@/lib/utils'

/**
 * Bug B (write-failure-visibility incident) — background sync used to be
 * mute-and-invisible: a failed write logged a `console.warn` and nothing on
 * screen ever said so. This is the persistent, visible signal the product
 * owner mandated — "not a toast that disappears, something that stays until
 * it resolves."
 *
 * It used to render NOTHING while the queue was empty (see the git history —
 * or `describeSyncIndicator`'s doc comment — for that original reasoning).
 * The product owner has since overridden that: they want an always-visible
 * icon near the account control so sync state is a glance away at all times,
 * including the calm "everything's saved" case, not only when something
 * needs attention. So this now always renders one of three states —
 * synced / syncing / failed — never `null`. The calm state stays visually
 * quiet (a static icon, no animation, no loud label) so the always-on
 * indicator still reads as "restrained," per CLAUDE.md, rather than turning
 * into an anxious status widget shouting "OK!" at every glance.
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

  if (indicator.kind === 'synced') {
    return (
      <Chip size="sm" className={className} role="status" aria-live="polite" title="Synced">
        <CloudCheck aria-hidden="true" className="size-[14px] text-ink-dim" />
        <span className="sr-only">All changes synced</span>
      </Chip>
    )
  }

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
        <CloudAlert aria-hidden="true" className="size-[14px] text-ink-dim" />
      ) : (
        <CloudUpload aria-hidden="true" className="size-[14px] animate-pulse text-ink-dim" />
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
