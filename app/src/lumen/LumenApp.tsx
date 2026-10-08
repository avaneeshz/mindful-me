import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { AppShell } from '@/lumen/components/shell'
import { LogSheet } from '@/lumen/components/log/log-sheet'
import { Toaster } from '@/lumen/components/ui/toaster'
import { StoreProvider, useStore } from '@/lumen/lib/store'
import { CalendarScreen } from '@/lumen/screens/calendar'
import { InsightsScreen } from '@/lumen/screens/insights'
import { MoreScreen } from '@/lumen/screens/more'
import { TodayScreen } from '@/lumen/screens/today'
import { HealthCallbackScreen } from '@/lumen/screens/settings/health-callback'
import { HEALTH_SYNC_CALLBACK_PATH } from '@/lib/googleHealthOAuth'
import { setLumenDocumentClass } from '@/lib/interfaceMode'
import { scrollLumenViewToTop } from '@/lumen/lib/scroll'
import { StorageNotice } from '@/lumen/components/storage-notice'
import { PickerDataProvider } from '@/state/PickerDataContext'
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
      {/* The same shared tile/activity data Classic mounts — see PickerDataContext. */}
      <PickerDataProvider>
        <StoreProvider>
          <LumenScreens />
        </StoreProvider>
      </PickerDataProvider>
    </MotionConfig>
  )
}

function LumenScreens() {
  const { tab, settingsView, quickLog, logTarget, openLog } = useStore()
  const { pathname } = useLocation()
  const onHealthCallback = pathname === HEALTH_SYNC_CALLBACK_PATH

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
        e.preventDefault()
        quickLog()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickLog])

  useEffect(() => {
    // Effects may return only a cleanup function. Keep the DOM API's return
    // value out of React's cleanup slot across browsers.
    scrollLumenViewToTop()
  }, [tab, settingsView])

  const Screen = { today: TodayScreen, calendar: CalendarScreen, insights: InsightsScreen, more: MoreScreen }[tab]

  return (
    <AppShell>
      <StorageNotice />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {onHealthCallback ? <HealthCallbackScreen /> : <Screen />}
        </motion.div>
      </AnimatePresence>
      <LogSheet target={logTarget} onClose={() => openLog(null)} />
      <Toaster />
    </AppShell>
  )
}
