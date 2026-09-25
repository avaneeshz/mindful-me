import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2 } from 'lucide-react'
import { useStore } from '@/lib/store'

export function Toaster() {
  const { toasts, dismissToast } = useStore()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-8"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex min-h-12 w-full max-w-[380px] items-center gap-3 rounded-full border border-line/10 bg-surface-3/95 py-1.5 pl-4 pr-1.5 shadow-raised backdrop-blur"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-mint" />
            <span className="flex-1 truncate text-sm text-ink">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
                className="h-9 rounded-full px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-white/[0.06]"
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-2" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
