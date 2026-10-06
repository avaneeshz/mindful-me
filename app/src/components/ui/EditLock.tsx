import type { ReactNode } from 'react'
import { useEditMode } from '@/state/EditModeContext'
import { cn } from '@/lib/utils'

/**
 * Locks a logging surface while Edit mode is on. The content stays visible
 * (so the layout doesn't jump) but becomes `inert`: no taps, focus, drags
 * or drops reach it. A transparent shield on top takes the tap instead and
 * flashes the shared "Finish editing to log" hint (`EditLockHint`).
 */
export function EditLock({
  children,
  className,
  dim = true,
}: {
  children: ReactNode
  className?: string
  /** Fade the locked content. Off for header buttons, which are the things being edited. */
  dim?: boolean
}) {
  const { editMode, notifyLocked } = useEditMode()
  if (!editMode) return <>{children}</>

  return (
    <div className={cn('relative', className)} data-edit-locked="">
      <div inert className={cn('transition-opacity', dim && 'opacity-50')}>
        {children}
      </div>
      <div
        aria-hidden="true"
        onClick={notifyLocked}
        className="absolute inset-0 z-[5] cursor-not-allowed"
      />
    </div>
  )
}

/** The one shared hint shown when a locked surface is tapped. Mount once per shell. */
export function EditLockHint() {
  const { lockedHintVisible } = useEditMode()
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-2xl z-50 flex justify-center px-lg transition-opacity duration-200',
        lockedHintVisible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {lockedHintVisible && (
        <span className="rounded-full bg-inv-bg px-lg py-sm text-caption font-semibold text-inv-ink shadow-elevation-2">
          Finish editing to log
        </span>
      )}
    </div>
  )
}
