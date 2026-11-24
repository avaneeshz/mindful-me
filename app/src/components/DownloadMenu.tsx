import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Download, LayoutGrid, Loader2 } from 'lucide-react'
import { chipVariants } from '@/components/ui/chip'
import type { ActivityList } from '@/domain/types'
import { downloadDayExportPdf } from '@/lib/dayExportPdf'
import { downloadLayoutExportPdf } from '@/lib/layoutExportPdf'
import { cn } from '@/lib/utils'
import { useExportBuilders } from '@/state/useExportBuilders'

export type DownloadKind = 'day' | 'layout'

const menuItemClass =
  'flex w-full items-start gap-md rounded-sm px-md py-sm text-left transition-colors hover:bg-bg focus-visible:bg-bg disabled:pointer-events-none disabled:opacity-40'

/**
 * The pure, prop-driven render for the header's download control — split out
 * from `DownloadMenu` below so its open/busy/error states can be exercised
 * directly with `renderToStaticMarkup` (this project's tests have no jsdom or
 * event simulation; see `HeaderBar.test.tsx`). A tap opens a small menu with
 * the two downloads; nothing here depends on hover.
 */
export const DownloadMenuView = ({
  open,
  pending,
  error,
  dayLabel,
  frameLabel,
  onToggle,
  onSelect,
  panelRef,
  triggerRef,
}: {
  open: boolean
  /** Which download is being built, or `null` when idle. */
  pending: DownloadKind | null
  error: string | null
  /** e.g. "Fri, Sep 11" — which day the summary covers. */
  dayLabel: string
  /** The frame whose layout would be saved. */
  frameLabel: string
  onToggle: () => void
  onSelect: (kind: DownloadKind) => void
  panelRef?: React.Ref<HTMLDivElement>
  triggerRef?: React.Ref<HTMLButtonElement>
}) => {
  const busy = pending !== null
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={busy ? 'Preparing your download…' : 'Download'}
        aria-busy={busy}
        disabled={busy}
        onClick={onToggle}
        className={cn(
          chipVariants({ tone: 'surface', size: 'sm', interactive: true }),
          'aspect-square px-0 disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
        ) : (
          <Download aria-hidden="true" className="size-[14px] text-ink-dim" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Download"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[260px] rounded-md border border-line bg-surface p-xs shadow-elevation-2"
        >
          <button type="button" role="menuitem" disabled={busy} onClick={() => onSelect('day')} className={menuItemClass}>
            <CalendarDays aria-hidden="true" className="mt-[2px] size-[16px] shrink-0 text-ink-dim" />
            <span className="flex min-w-0 flex-col">
              <span className="text-body font-semibold text-ink">Day summary</span>
              <span className="text-caption text-ink-dim">Everything logged on {dayLabel} · PDF</span>
            </span>
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => onSelect('layout')} className={menuItemClass}>
            <LayoutGrid aria-hidden="true" className="mt-[2px] size-[16px] shrink-0 text-ink-dim" />
            <span className="flex min-w-0 flex-col">
              <span className="text-body font-semibold text-ink">Current layout</span>
              <span className="text-caption text-ink-dim">Buttons and tiles in {frameLabel} · PDF</span>
            </span>
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[220px] rounded-md border border-line bg-surface px-md py-sm text-caption font-semibold text-ink shadow-elevation-2"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Header control (row 1) — one Download button, two choices:
 *  - **Day summary**: everything recorded for the viewed calendar day, as one
 *    PDF. Assembly is pure and local-state-only except for one scoped network
 *    read (note entries for the day); if that read fails or there is no
 *    backend, the export still completes from local state (rule 6).
 *  - **Current layout**: the buttons, categories and tiles set up in the
 *    frame on screen, as one PDF.
 */
export function DownloadMenu({ viewedDate, activities }: { viewedDate: Date; activities: ActivityList }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<DownloadKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { buildDayExport, buildLayoutExport, frameName } = useExportBuilders()

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

  async function handleSelect(kind: DownloadKind) {
    if (pending) return
    setOpen(false)
    setPending(kind)
    setError(null)
    if (errorTimeout.current) clearTimeout(errorTimeout.current)
    try {
      if (kind === 'day') downloadDayExportPdf(await buildDayExport(viewedDate, activities))
      else downloadLayoutExportPdf(buildLayoutExport())
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[export] failed to build the ${kind} export PDF`, err)
      setError('Could not build the file — try again.')
      errorTimeout.current = setTimeout(() => setError(null), 4000)
    } finally {
      setPending(null)
    }
  }

  return (
    <DownloadMenuView
      open={open}
      pending={pending}
      error={error}
      dayLabel={viewedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      frameLabel={frameName}
      onToggle={() => setOpen((value) => !value)}
      onSelect={(kind) => void handleSelect(kind)}
      panelRef={panelRef}
      triggerRef={triggerRef}
    />
  )
}
