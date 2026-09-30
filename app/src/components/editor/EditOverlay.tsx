import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import { useIsMobile } from '@/lib/useIsMobile'

/**
 * The one container the inline Edit mode uses for its small editors: a
 * popover anchored to the tile on desktop and tablet, a bottom sheet on a
 * phone (a popover squeezed against a phone edge is hard to use — the
 * information hierarchy changes, it isn't just shrunk). `anchor` is the
 * element the popover points at; it always renders, open or not.
 *
 * Deliberately no `Portal` for either flavour, same reason as
 * `TileRow`'s own dialog: this app's tests are server-rendered strings and
 * portalled content never appears in them. Both are `position: fixed` /
 * popper-placed either way.
 */
export function EditOverlay({
  open,
  onOpenChange,
  label,
  anchor,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible name for the popover / sheet. */
  label: string
  anchor: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <>
        {anchor}
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-md overflow-y-auto rounded-t-lg bg-surface p-lg shadow-elevation-2 [padding-bottom:max(16px,env(safe-area-inset-bottom))] focus:outline-none"
          >
            <Dialog.Title className="sr-only">{label}</Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Root>
      </>
    )
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor asChild>{anchor}</Popover.Anchor>
      <Popover.Content
        side="bottom"
        align="center"
        sideOffset={8}
        collisionPadding={12}
        aria-label={label}
        className="z-50 flex w-[min(360px,calc(100vw-24px))] max-h-[min(560px,var(--radix-popover-content-available-height))] flex-col gap-md overflow-y-auto rounded-lg border border-line bg-surface p-lg shadow-elevation-2 focus:outline-none"
      >
        {children}
      </Popover.Content>
    </Popover.Root>
  )
}
