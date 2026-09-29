import { AlertTriangle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/lumen/components/ui/button'
import { EmptyState } from '@/lumen/components/ui/primitives'
import { useStore } from '@/lumen/lib/store'
import { useHealthOAuthCallback } from '@/state/useHealthOAuthCallback'

/**
 * Where Google sends the person back to (`/health-sync/callback`) when they
 * connected from Lumen. Finishes the exchange, then lands on Devices & apps.
 */
export function HealthCallbackScreen() {
  const navigate = useNavigate()
  const { openSettings } = useStore()

  function backTo(view: 'devices' | 'devices-add') {
    navigate('/', { replace: true })
    openSettings(view)
  }

  const { view, errorMessage } = useHealthOAuthCallback(() => backTo('devices'))

  if (view === 'error') {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <div className="surface rounded-card">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn’t connect"
            body={errorMessage ?? 'Could not finish connecting.'}
            action={<Button variant="primary" onClick={() => backTo('devices-add')}>Try again</Button>}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-20 text-ink-muted">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <p className="text-sm">Connecting…</p>
    </div>
  )
}
