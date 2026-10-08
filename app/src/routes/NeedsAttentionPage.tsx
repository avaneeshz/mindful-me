import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { NeedsAttentionPanel } from '@/components/settings/NeedsAttentionPanel'

export function NeedsAttentionPage() {
  return (
    <div className="mb-5xl mx-auto w-full max-w-[640px]">
      <Link
        to="/settings"
        className="inline-flex items-center gap-xs text-caption font-medium text-ink-dim transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-[14px]" />
        Settings
      </Link>
      <h1 className="mt-md font-display text-slot-time font-semibold text-ink">Not synced</h1>
      <div className="mt-lg">
        <NeedsAttentionPanel />
      </div>
    </div>
  )
}
