import { useEffect, useState } from 'react'
import { CloudOff, Loader2, RefreshCw, RotateCw } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import { CONFLICT_NOTICE_MS, type SyncStatus } from '@/state/syncEngine'
import { cn } from '@/lib/utils'

export type SyncIndicatorTone = 'offline' | 'problem' | 'busy' | 'conflict'

export interface SyncIndicatorView {
  tone: SyncIndicatorTone
  label: string
  /** The full story, for the title/aria label — never truncated in the pill. */
  detail: string
  /** True when the pill offers a manual retry. */
  actionable: boolean
}

/**
 * What (if anything) the header should say about background sync, derived
 * purely from the engine's status — no rendering, no timers, so every state
 * is unit-testable.
 *
 * Silence is the default and the goal (CLAUDE.md: restrained, low cognitive
 * load). A healthy, fully-synced app shows NOTHING here: a permanently lit
 * "Synced ✓" badge is exactly the anxious status widget this product should
 * not have. The pill appears only when there is something true and useful to
 * say — the device is offline, writes are not getting through, writes are in
 * flight, or another device's edit just replaced one of yours.
 */
export function describeSyncIndicator(status: SyncStatus, now: number): SyncIndicatorView | null {
  if (!status.enabled) return null

  const conflictFresh =
    status.lastConflictAt !== null && now - status.lastConflictAt < CONFLICT_NOTICE_MS

  if (!status.online) {
    return {
      tone: 'offline',
      label: status.pending > 0 ? `Offline · ${status.pending} unsynced` : 'Offline',
      detail:
        status.pending > 0
          ? `Offline. ${status.pending} ${status.pending === 1 ? 'change is' : 'changes are'} saved on this device and will sync automatically when you reconnect.`
          : 'Offline. Everything you log is saved on this device and will sync when you reconnect.',
      actionable: false,
    }
  }

  if (status.retrying) {
    return {
      tone: 'problem',
      label: status.pending > 1 ? `Can’t sync · ${status.pending} waiting` : 'Can’t sync',
      detail: `Your changes are saved on this device but aren’t reaching the server${
        status.lastError ? ` (${status.lastError})` : ''
      }. Retrying automatically — or try now.`,
      actionable: true,
    }
  }

  // Rule 7, made visible: a newer edit from another device replaced one of
  // yours. The one that lost is kept in the activity history, never dropped.
  if (conflictFresh) {
    return {
      tone: 'conflict',
      label: 'Updated from another device',
      detail:
        'A newer edit from another device replaced one of yours here. The replaced version is kept in this activity’s history.',
      actionable: false,
    }
  }

  if (status.pending > 0) {
    return {
      tone: 'busy',
      label: 'Syncing…',
      detail: `Saving ${status.pending} ${status.pending === 1 ? 'change' : 'changes'} to your account.`,
      actionable: false,
    }
  }

  return null
}

const TONE_CLASS: Record<SyncIndicatorTone, string> = {
  offline: 'text-muted',
  problem: 'text-terracotta border-terracotta/40',
  busy: 'text-muted',
  conflict: 'text-forest',
}

/**
 * The header's background-sync indicator. Hidden whenever there is nothing to
 * report, a plain chip when there is, and a real button only in the one state
 * where the user can actually do something ("Can't sync" → try again now).
 *
 * States covered: hidden/idle, offline (with and without pending writes),
 * syncing, not-getting-through (+ hover/focus/active/disabled on its retry
 * button), and the transient "updated from another device" notice.
 */
export function SyncStatusPill({
  status,
  onRetry,
  className,
}: {
  status: SyncStatus
  onRetry: () => void
  className?: string
}) {
  // The conflict notice expires on a clock, not on a status change, so the
  // pill needs its own tick to stop showing it.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (status.lastConflictAt === null) return
    const remaining = status.lastConflictAt + CONFLICT_NOTICE_MS - Date.now()
    if (remaining <= 0) return
    const id = window.setTimeout(() => setTick((value) => value + 1), remaining)
    return () => window.clearTimeout(id)
  }, [status.lastConflictAt])

  const view = describeSyncIndicator(status, Date.now())
  if (!view) return null

  const icon =
    view.tone === 'offline' ? (
      <CloudOff aria-hidden="true" className="size-[14px] shrink-0" />
    ) : view.tone === 'problem' ? (
      <RefreshCw aria-hidden="true" className="size-[14px] shrink-0" />
    ) : view.tone === 'conflict' ? (
      <RotateCw aria-hidden="true" className="size-[14px] shrink-0" />
    ) : (
      <Loader2 aria-hidden="true" className="size-[14px] shrink-0 animate-spin" />
    )

  const shared = cn(
    'max-w-[240px] font-semibold',
    TONE_CLASS[view.tone],
    className,
  )

  if (!view.actionable) {
    return (
      <Chip
        size="sm"
        role="status"
        aria-live="polite"
        title={view.detail}
        aria-label={view.detail}
        className={shared}
      >
        {icon}
        <span className="truncate">{view.label}</span>
      </Chip>
    )
  }

  return (
    <Chip
      as="button"
      size="sm"
      interactive
      role="status"
      aria-live="polite"
      title={view.detail}
      aria-label={`${view.detail} Retry now.`}
      onClick={onRetry}
      className={cn(
        shared,
        'transition-colors hover:border-terracotta hover:bg-terracotta/5',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta',
        'active:bg-terracotta/10',
      )}
    >
      {icon}
      <span className="truncate">{view.label}</span>
    </Chip>
  )
}
