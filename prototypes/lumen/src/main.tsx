import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { AppShell } from '@/components/shell'
import { ActivitySheet } from '@/components/today/activity-sheet'
import { Toaster } from '@/components/ui/toaster'
import { StoreProvider, useStore } from '@/lib/store'
import { CalendarScreen } from '@/screens/calendar'
import { InsightsScreen } from '@/screens/insights'
import { MoreScreen } from '@/screens/more'
import { TodayScreen } from '@/screens/today'
import './index.css'

function App() {
  const { tab, quickLogOpen, setQuickLogOpen } = useStore()

  // "L" opens quick log from anywhere (desktop affordance shown in the sidebar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key.toLowerCase() === 'l' && !e.metaKey && !e.ctrlKey && !/input|textarea/i.test(t.tagName) && !document.querySelector('[role="dialog"]')) {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <App />
      </StoreProvider>
    </MotionConfig>
  </StrictMode>,
)
