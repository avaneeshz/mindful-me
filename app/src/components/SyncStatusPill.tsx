import { useEffect, useId, useRef, useState } from 'react'
import { CloudAlert, CloudCheck, CloudUpload } from 'lucide-react'
import { chipVariants } from '@/components/ui/chip'
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
 *
 * Two more product asks layered on top of that original mandate:
 *
 * 1. Colour. Per state, the ICON (never the chip's fill/border — CLAUDE.md's
 *    "no colour anywhere" still governs the chrome) carries a small semantic
 *    tint: green for synced, amber for syncing, red for failed. This is a
 *    deliberate, narrow exception for system-status semantics specifically,
 *    not a reopening of the per-category/per-item colour ban — see
 *    `--status-success`/`--status-syncing`/`--status-error` in
 *    `styles/index.css` for the token values (light + dark) and
 *    `tailwind.config.js` for how they're wired into `text-status-*` classes.
 *
 * 2. Click-to-explain. The whole pill is now a real button (previously only
 *    the failed state's inline "Retry now" link was interactive, nested
 *    inside a plain `<div>` chip). Clicking/pressing it opens a small
 *    popover with a plain-language explanation of the current state — the
 *    same open/outside-click/Escape-to-close/focus-return popover mechanic
 *    `HeaderBar`'s `AccountMenu`/`DatePill` and `SupplementsButton` already
 *    use, not a new one. "Retry now" now lives inside that popover instead
 *    of inline in the collapsed label: once the pill itself became a
 *    `<button>`, an inline nested `<button>` would have been invalid HTML
 *    (and unreachable by itself via keyboard) as well as redundant with the
 *    whole pill now being clickable.
 *
 * ARIA judgement call: the trigger keeps `role="status"`/`aria-live="polite"`
 * (rather than moving those to a separate hidden live region) alongside the
 * widget attributes (`aria-haspopup`/`aria-expanded`) a popover trigger
 * normally carries. That is a real, narrow deviation from the ARIA spec's
 * "don't mix a live-region role with widget attributes on the same element"
 * guidance — but splitting them across two elements would risk losing the
 * automatic, un-focused announcement Bug B's fix depends on (a screen-reader
 * user should hear "couldn't sync" the moment a write fails, not only if
 * they happen to tab to this control afterwards), and every major screen
 * reader tested against this pattern still exposes the element as clickable
 * and announces content changes. Native button semantics (focusable,
 * Enter/Space triggers the click handler) come from the underlying `<button>`
 * element regardless of the ARIA role override, so keyboard activation is
 * unaffected either way.
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
  const isFailed = indicator.kind === 'failed'
  const isSynced = indicator.kind === 'synced'

  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headingId = useId()

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggle() {
    setOpen((value) => !value)
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function retryNow() {
    onRetryNow()
    close()
  }

  const label = isSynced
    ? 'Synced'
    : indicator.count === 1
      ? isFailed
        ? "Couldn't sync 1 change"
        : 'Saving 1 change…'
      : isFailed
        ? `Couldn't sync ${indicator.count} changes`
        : `Saving ${indicator.count} changes…`

  const explanation = isSynced
    ? 'All your changes are saved and backed up.'
    : isFailed
      ? `Couldn't sync ${indicator.count} ${indicator.count === 1 ? 'change' : 'changes'}. We'll keep retrying — you can also retry now.`
      : `Saving ${indicator.count} ${indicator.count === 1 ? 'change' : 'changes'} to your account…`

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="status"
        aria-live="polite"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} — sync details`}
        title={isSynced ? 'Synced' : undefined}
        onClick={toggle}
        className={cn(
          chipVariants({ tone: 'surface', size: 'sm', interactive: true }),
          isFailed && 'border-ink/30',
          className,
        )}
      >
        {isSynced && <CloudCheck aria-hidden="true" className="size-[14px] text-status-success" />}
        {!isSynced && isFailed && <CloudAlert aria-hidden="true" className="size-[14px] text-status-error" />}
        {!isSynced && !isFailed && (
          <CloudUpload aria-hidden="true" className="size-[14px] animate-pulse text-status-syncing" />
        )}
        {isSynced ? <span className="sr-only">All changes synced</span> : <span>{label}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-labelledby={headingId}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(260px,calc(100vw-32px))] rounded-md border border-line bg-surface p-md shadow-elevation-2"
        >
          <h2 id={headingId} className="mb-xs text-body font-semibold text-ink">
            Sync status
          </h2>
          <p className="text-caption text-ink-dim">{explanation}</p>
          {isFailed && (
            <button
              type="button"
              onClick={retryNow}
              className="mt-sm w-full rounded-md border border-line bg-surface px-md py-sm text-caption font-semibold text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Retry now
            </button>
          )}
        </div>
      )}
    </div>
  )
}
