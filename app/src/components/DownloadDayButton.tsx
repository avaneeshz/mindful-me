import { useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { chipVariants } from '@/components/ui/chip'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { assembleDayExport } from '@/domain/dayExport'
import type { ActivityList } from '@/domain/types'
import { apiListNoteEntriesForDate } from '@/api/notes'
import { downloadDayExportPdf } from '@/lib/dayExportPdf'
import { loadDisplayValue } from '@/lib/displayValuesLocalStore'
import { localDateISO, localDayRange } from '@/lib/localTime'
import { cn } from '@/lib/utils'

function reflectionCardTitle(card: number): string {
  return REFLECTION_CARDS.find((c) => c.number === card)?.title ?? `Card ${card}`
}

/**
 * The pure, prop-driven render for the header's download control — split out
 * from `DownloadDayButton` below purely so its busy/disabled/error states can
 * be exercised directly in a test via `renderToStaticMarkup` (this project's
 * existing testing convention — see `HeaderBar.test.tsx`/`SyncStatusPill.tsx`
 * — has no jsdom/event-simulation available, so a stateful component's own
 * transitions can't be driven by a click; a presentational component takes
 * the state as props instead).
 */
export function DownloadDayButtonView({
  pending,
  error,
  onDownload,
}: {
  pending: boolean
  error: string | null
  onDownload: () => void
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={pending ? "Downloading this day's data…" : "Download this day's data as a PDF"}
        aria-busy={pending}
        disabled={pending}
        onClick={onDownload}
        className={cn(
          chipVariants({ tone: 'surface', size: 'sm', interactive: true }),
          'aspect-square px-0 disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
        ) : (
          <Download aria-hidden="true" className="size-[14px] text-ink-dim" />
        )}
      </button>

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
 * Header control (row 1) — downloads everything recorded for the viewed
 * calendar day as one PDF. Assembly (`domain/dayExport.ts`) is pure and
 * local-state-only except for one scoped network read (note entries for the
 * day, `apiListNoteEntriesForDate`); if that read fails or there is no
 * backend configured, the export still completes from whatever local state
 * is available (rule 6) — this control never blocks or errors out entirely
 * over one optional section.
 */
export function DownloadDayButton({
  viewedDate,
  activities,
}: {
  viewedDate: Date
  /** The board for the viewed day (`state.activities`) — already scoped to this calendar day, see `domain/dayExport.ts`. */
  activities: ActivityList
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleDownload() {
    if (pending) return
    setPending(true)
    setError(null)
    if (errorTimeout.current) clearTimeout(errorTimeout.current)

    try {
      const dateKey = localDateISO(viewedDate)
      const { start, end } = localDayRange(viewedDate)
      // Fails open: a `null` here (no backend, or the read didn't reach the
      // server) just means the notes section is empty — never blocks the rest
      // of the export, which is already sitting in local state.
      const noteEntries = (await apiListNoteEntriesForDate(start, end)) ?? []

      const data = assembleDayExport({
        viewedDate,
        activities,
        noteEntries,
        localDisplayValues: { steps: loadDisplayValue('steps', dateKey) },
        reflectionCardTitle,
      })

      downloadDayExportPdf(data)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[export] failed to build the day export PDF', err)
      setError('Could not build the file — try again.')
      errorTimeout.current = setTimeout(() => setError(null), 4000)
    } finally {
      setPending(false)
    }
  }

  return <DownloadDayButtonView pending={pending} error={error} onDownload={() => void handleDownload()} />
}
