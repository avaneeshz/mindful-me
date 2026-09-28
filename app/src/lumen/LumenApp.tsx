import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { AppShell } from '@/lumen/components/shell'
import { ActivitySheet } from '@/lumen/components/today/activity-sheet'
import { Toaster } from '@/lumen/components/ui/toaster'
import { StoreProvider, useStore } from '@/lumen/lib/store'
import { CalendarScreen } from '@/lumen/screens/calendar'
import { InsightsScreen } from '@/lumen/screens/insights'
import { MoreScreen } from '@/lumen/screens/more'
import { TodayScreen } from '@/lumen/screens/today'
import { setLumenDocumentClass } from '@/lib/interfaceMode'
import './lumen.css'

/**
 * The Lumen interface — the whole signed-in product when the Classic /
 * Lumen switch (`state/InterfaceContext.tsx`) is on Lumen. Loaded lazily
 * from `App.tsx`, so people on Classic never download it.
 */
export default function LumenApp() {
  useEffect(() => {
    setLumenDocumentClass(true)
    return () => setLumenDocumentClass(false)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <LumenScreens />
      </StoreProvider>
    </MotionConfig>
  )
}

function LumenScreens() {
  const { tab, quickLogOpen, setQuickLogOpen } = useStore()

  // "L" opens quick log from anywhere (desktop affordance shown in the sidebar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (
        e.key.toLowerCase() === 'l' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !/input|textarea/i.test(t.tagName) &&
        !t.isContentEditable &&
        !document.querySelector('[role="dialog"]')
      ) {
        setQuickLogOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setQuickLogOpen])

  useEffect(() => window.scrollTo({ top: 0 }), [tab])

  const Screen = { today: TodayScreen, calendar: CalendarScreen, insights: InsightsScreen, more: MoreScreen }[tab]

  return (
    <AppShell>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
      <ActivitySheet category={null} open={quickLogOpen} onOpenChange={setQuickLogOpen} />
      <Toaster />
    </AppShell>
  )
}
