import { CircleAlert, CloudUpload, RotateCw } from 'lucide-react'
import { retryPendingWritesNow } from '@/state/pendingWrites'
import { describeSyncIndicator } from '@/state/syncQueue'
import { usePendingWrites } from '@/state/usePendingWrites'
import { Button } from '@/lumen/components/ui/button'
import { Popover } from '@/lumen/components/ui/primitives'
import { useStore } from '@/lumen/lib/store'
import { cn } from '@/lumen/lib/utils'

/**
 * Lumen's view of the shared sync queue (Bug B: a write that hasn't reached
 * the server must stay visible until it does). Calm by default: nothing at
 * all while everything is synced, a quiet mark while saving, and a clear
 * warning with "Retry now" when a write keeps failing.
 */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { data, openSettings } = useStore()
  const pendingWrites = usePendingWrites()
  const state = describeSyncIndicator([...data.syncQueue, ...pendingWrites])
  if (state.kind === 'synced') return null

  const failed = state.kind === 'failed'
  const label = failed
    ? `${state.count} ${state.count === 1 ? 'change' : 'changes'} not synced`
    : `Saving ${state.count} ${state.count === 1 ? 'change' : 'changes'}`

  return (
    <Popover
      align="end"
      className="w-72 p-4"
      trigger={
        <Button
          size={compact ? 'icon' : 'md'}
          aria-label={label}
          className={cn(failed && 'border-danger/40 text-danger')}
        >
          {failed ? <CircleAlert className="h-[18px] w-[18px]" /> : <CloudUpload className="h-[18px] w-[18px] text-ink-muted" />}
          {!compact && <span className={cn('text-sm', !failed && 'text-ink-muted')}>{failed ? 'Not synced' : 'Saving'}</span>}
        </Button>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-sm text-ink-muted">
            {failed
              ? 'Everything is saved on this device and will keep retrying on its own.'
              : 'Saved on this device — sending to your account in the background.'}
          </p>
          {failed && (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                data.retrySyncNow()
                retryPendingWritesNow()
                close()
              }}
            >
              <RotateCw className="h-4 w-4" />
              Retry now
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              openSettings('needs-attention')
              close()
            }}
          >
            See what’s waiting
          </Button>
        </div>
      )}
    </Popover>
  )
}
