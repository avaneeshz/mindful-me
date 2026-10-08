import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, RotateCw } from 'lucide-react'
import { discardPendingWrite, retryPendingWrite, retryPendingWritesNow } from '@/state/pendingWrites'
import { pendingWriteRows, type PendingWriteRow } from '@/state/pendingWritesView'
import { usePendingWrites } from '@/state/usePendingWrites'
import { Button } from '@/lumen/components/ui/button'
import { EmptyState } from '@/lumen/components/ui/primitives'
import { cn } from '@/lumen/lib/utils'
import { SettingsPage } from './parts'

const STATE_LABEL: Record<PendingWriteRow['state'], string> = {
  rejected: 'Refused by the server',
  retrying: 'Retrying',
  sending: 'Sending',
}

/** Settings → Not synced (Lumen). Same data, hook and wording as Classic's panel; only the screens differ. */
export function NeedsAttentionScreen({ onBack }: { onBack: () => void }) {
  const writes = usePendingWrites()
  const now = useNow(10_000)
  const rows = useMemo(() => pendingWriteRows(writes, now), [writes, now])
  const refused = rows.filter((row) => row.state === 'rejected').length

  return (
    <SettingsPage eyebrow="Settings" title="Not synced" onBack={onBack}>
      {rows.length === 0 ? (
        <div className="surface rounded-card">
          <EmptyState icon={CircleCheck} title="Everything is synced" body="Every change you made has reached your account." />
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {rows.length} {rows.length === 1 ? 'change is' : 'changes are'} saved on this device but not on the server yet
            {refused > 0 ? `, ${refused} of them refused` : ''}. Nothing is lost — they keep retrying on their own.
          </p>
          <Button variant="quiet" onClick={retryPendingWritesNow}>
            <RotateCw className="h-4 w-4" />
            Retry all now
          </Button>
          <ul className="surface divide-y divide-line/[0.06] overflow-hidden rounded-card">
            {rows.map((row) => (
              <AttentionRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </SettingsPage>
  )
}

function AttentionRow({ row }: { row: PendingWriteRow }) {
  const [showDetail, setShowDetail] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="flex flex-col gap-2 px-4 py-4">
      <p className={cn('text-xs', row.state === 'rejected' ? 'font-medium text-danger' : 'text-ink-muted')}>{STATE_LABEL[row.state]}</p>
      <p className="break-words text-[15px] text-ink">{row.title}</p>
      <p className="text-xs text-ink-muted">{row.reason}</p>
      {row.detail && (
        <>
          <button
            type="button"
            aria-expanded={showDetail}
            onClick={() => setShowDetail((v) => !v)}
            className="self-start text-xs text-ink underline underline-offset-2"
          >
            {showDetail ? 'Hide what was saved' : 'Show what was saved'}
          </button>
          {showDetail && (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/[0.04] p-3 text-xs leading-relaxed text-ink">
              {row.detail}
            </pre>
          )}
        </>
      )}
      {confirming ? (
        <div role="group" aria-label="Confirm discard" className="flex flex-col gap-2">
          <p className="text-xs text-ink">
            Stop trying to send this? It will disappear from this device the next time the app refreshes. What it
            contained stays readable in the Activity log for 3 days.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => discardPendingWrite(row.id)}>
              Yes, discard
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="quiet" onClick={() => retryPendingWrite(row.id)}>
            <RotateCw className="h-4 w-4" />
            Retry
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(true)}>
            Discard
          </Button>
        </div>
      )}
    </li>
  )
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
