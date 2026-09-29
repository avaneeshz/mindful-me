import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHealthOAuthCallback } from '@/state/useHealthOAuthCallback'

/**
 * The exact route `/health-sync/callback` (fixed on every environment's own
 * origin — see the agent brief this shipped from). Google redirects here
 * with either `?code=...&state=...` or `?error=...`; this page's only job is
 * to verify the CSRF `state`, hand the code to the Edge Function that does
 * the real (server-side, secret-holding) token exchange, and send the
 * person back to `/health-sync`.
 */
export function HealthSyncCallbackPage() {
  const navigate = useNavigate()
  const { view, errorMessage } = useHealthOAuthCallback(() => navigate('/health-sync', { replace: true }))

  if (view === 'exchanging' || view === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-md py-5xl text-ink-dim">
        <Loader2 aria-hidden="true" className="size-[28px] animate-spin" />
        <p className="text-caption">Connecting Google Health…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-3xl max-w-[480px] rounded-md border border-line-soft bg-surface p-2xl text-center">
      <div className="mx-auto flex size-brand items-center justify-center rounded-full bg-ink/[0.06] text-ink">
        <AlertTriangle aria-hidden="true" className="size-[24px]" />
      </div>
      <h1 className="mt-lg font-display text-slot-time font-semibold text-ink">Couldn’t connect Google Health</h1>
      <p role="alert" className="mt-sm text-caption text-ink-dim">
        {errorMessage}
      </p>
      <div className="mt-lg">
        <Button onClick={() => navigate('/health-sync', { replace: true })}>Back to Health Sync</Button>
      </div>
    </div>
  )
}
