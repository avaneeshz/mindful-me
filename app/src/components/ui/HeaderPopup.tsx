import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The window a header button opens (a note entry, a quick log, a checklist).
 * Centered on the screen and sized to the screen rather than to the button: on
 * a desktop or tablet it is 80% of the width — a 10% margin each side — and
 * fills the height less a margin top and bottom; on a phone the side margins
 * shrink to 8px so the content gets nearly the whole screen. It scrolls inside
 * itself when the content is taller.
 *
 * A dimmed backdrop sits behind it; pressing the backdrop closes it, as do the
 * owner's own outside-press and Escape handling. Used by every header button so
 * they all open the same way.
 */
/** The window's size and surface, shared with other editors that open the same 80% window. */
export const headerPopupClass = cn(
  'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
  'w-[80vw] max-h-[calc(100dvh-96px)] mobile:w-[calc(100vw-16px)] mobile:max-h-[calc(100dvh-32px)]',
  'rounded-md border border-line bg-surface p-lg shadow-elevation-2 mobile:p-md',
)

export function HeaderPopup({
  onClose,
  className,
  children,
  ...dialogProps
}: {
  onClose: () => void
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        {...dialogProps}
        className={cn(headerPopupClass, className)}
      >
        {children}
      </div>
    </>
  )
}
