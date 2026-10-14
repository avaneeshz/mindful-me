import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { discardPendingWrite, retryPendingWrite, retryPendingWritesNow } from '@/state/pendingWrites'
import { pendingWriteRows } from '@/state/pendingWritesView'
import { useOptionalBoard } from '@/state/BoardContext'
import { syncQueueRows } from '@/state/syncQueue'
import { usePendingWrites } from '@/state/usePendingWrites'
import { cn } from '@/lib/utils'

/** One line of the list, whichever of the two ledgers it came from. */
interface AttentionItem {
  id: string
  state: 'rejected' | 'retrying' | 'sending'
  title: string
  reason: string
  detail: string | undefined
  onRetry: () => void
  onDiscard: () => void
}

const STATE_LABEL: Record<AttentionItem['state'], string> = {
  rejected: 'Refused by the server',
  retrying: 'Retrying',
  sending: 'Sending',
}

/**
 * Settings → "Not synced": every change the server has not confirmed yet.
 * Nothing here is lost — it is all saved on this device and keeps retrying —
 * but a change the server refused for good needs a decision: retry it, or
 * discard it and make the change again.
 */
export function NeedsAttentionPanel() {
  const writes = usePendingWrites()
  const now = useNow(10_000)
  // Scheduled activities (what you log on Today) have their own queue, held by the board.
  const board = useOptionalBoard()
  const queue = board?.syncQueue
  const rows = useMemo<AttentionItem[]>(() => {
    const fromLedger = pendingWriteRows(writes, now).map((row) => ({
      id: `w:${row.id}`,
      state: row.state,
      title: row.title,
      reason: row.reason,
      detail: row.detail,
      onRetry: () => retryPendingWrite(row.id),
      onDiscard: () => discardPendingWrite(row.id),
    }))
    const fromQueue = (queue ? syncQueueRows(queue, now) : []).map((row) => ({
      id: `q:${row.id}`,
      state: row.state,
      title: row.title,
      reason: row.reason,
      detail: row.detail,
      onRetry: () => board?.retrySyncItem(row.id),
      onDiscard: () => board?.discardSyncItem(row.id),
    }))
    const order = { rejected: 0, retrying: 1, sending: 2 } as const
    return [...fromQueue, ...fromLedger].sort((a, b) => order[a.state] - order[b.state])
  }, [writes, queue, board, now])
  const refused = rows.filter((row) => row.state === 'rejected').length

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-line-soft bg-surface p-2xl text-center">
        <div className="mx-auto flex size-brand items-center justify-center rounded-full bg-ink/[0.06] text-ink">
          <CircleCheck aria-hidden="true" className="size-[24px]" />
        </div>
        <p className="mt-lg text-body font-semibold text-ink">Everything is synced</p>
        <p className="mt-xs text-caption text-ink-dim">Every change you made has reached your account.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-caption text-ink-dim">
        {rows.length} {rows.length === 1 ? 'change is' : 'changes are'} saved on this device but not on the server yet
        {refused > 0 ? `, ${refused} of them refused by the server` : ''}. Nothing is lost.{' '}
        {refused > 0 ? 'Refused ones wait for your decision; the others keep retrying on their own.' : 'They keep retrying on their own.'}
      </p>
      <Button variant="outline" size="control" className="mt-lg" onClick={() => {
          retryPendingWritesNow()
          board?.retrySyncNow()
        }}>
        <RotateCw aria-hidden="true" className="size-[16px]" />
        Retry all now
      </Button>
      <ul className="mt-lg flex flex-col gap-sm">
        {rows.map((row) => (
          <AttentionRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  )
}

function AttentionRow({ row }: { row: AttentionItem }) {
  const [showDetail, setShowDetail] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="rounded-md border border-line-soft bg-surface p-lg">
      <p className={cn('text-caption', row.state === 'rejected' ? 'font-semibold text-ink' : 'text-ink-dim')}>
        {STATE_LABEL[row.state]}
      </p>
      <p className="mt-xs break-words text-body font-semibold text-ink">{row.title}</p>
      <p className="mt-xs text-caption text-ink-dim">{row.reason}</p>

      {row.detail ? (
        <>
          <button
            type="button"
            aria-expanded={showDetail}
            onClick={() => setShowDetail((v) => !v)}
            className="mt-md text-caption font-medium text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            {showDetail ? 'Hide what was saved' : 'Show what was saved'}
          </button>
          {showDetail ? (
            <pre className="mt-sm max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-ink/[0.04] p-md text-[12px] leading-relaxed text-ink">
              {row.detail}
            </pre>
          ) : null}
        </>
      ) : null}

      {confirming ? (
        <div role="group" aria-label="Confirm discard" className="mt-md">
          <p className="text-caption text-ink">
            Stop trying to send this? It will disappear from this device the next time the app refreshes. What it
            contained stays readable in the Activity log for 3 days.
          </p>
          <div className="mt-sm flex gap-sm">
            <Button variant="primary" size="control" onClick={row.onDiscard}>
              Yes, discard
            </Button>
            <Button variant="outline" size="control" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-md flex gap-sm">
          <Button variant="outline" size="control" onClick={row.onRetry}>
            <RotateCw aria-hidden="true" className="size-[16px]" />
            Retry
          </Button>
          <Button variant="outline" size="control" onClick={() => setConfirming(true)}>
            Discard
          </Button>
        </div>
      )}
    </li>
  )
}

/** Re-renders on an interval so "trying again in …" stays honest. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
