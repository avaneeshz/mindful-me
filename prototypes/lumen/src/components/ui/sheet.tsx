import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/use-media-query'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  leading?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Bottom sheet on phones, centered panel from tablet up.
 * One component so every modal in the app shares the same anatomy.
 */
export function Sheet({ open, onOpenChange, title, description, leading, children, footer, className }: SheetProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[rgb(3_5_12/0.72)] backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className={cn(
                  'fixed z-50 flex flex-col overflow-hidden border border-line/10 bg-surface-1 shadow-raised outline-none',
                  isDesktop
                    ? 'left-1/2 top-1/2 max-h-[min(720px,88dvh)] w-[min(480px,calc(100vw-48px))] rounded-panel'
                    : 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-panel pb-safe',
                  className,
                )}
                initial={isDesktop ? { opacity: 0, scale: 0.97, x: '-50%', y: '-48%' } : { y: '100%' }}
                animate={isDesktop ? { opacity: 1, scale: 1, x: '-50%', y: '-50%' } : { y: 0 }}
                exit={isDesktop ? { opacity: 0, scale: 0.98, x: '-50%', y: '-49%' } : { y: '100%' }}
                transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: isDesktop ? 0.2 : 0.3 }}
              >
                {!isDesktop && <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/15" aria-hidden />}
                <div className="flex items-start gap-3 px-5 pb-4 pt-4 md:px-6 md:pt-6">
                  {leading}
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="mt-0.5 text-sm text-ink-muted">{description}</Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">Dialog</Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close
                    className="-mr-1.5 -mt-1 grid h-10 w-10 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
                    aria-label="Close"
                  >
                    <X className="h-[18px] w-[18px]" />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div>
                {footer && <div className="border-t border-line/[0.07] bg-surface-1 px-5 py-4 md:px-6">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
