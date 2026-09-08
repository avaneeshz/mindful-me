import { useEffect } from 'react'
import { periodOfSlot } from '@/domain/slots'
import { useBoard } from '@/state/BoardContext'
import { useTheme } from '@/state/ThemeContext'

/**
 * Derives the app theme from the currently selected timeline slot — a slot in
 * the Day row (06:00–18:00) ⇒ light, a slot in the Night row ⇒ dark. This is
 * the ONLY thing that sets the theme now: there is no manual toggle.
 *
 * Renders nothing. Mounted once inside `BoardProvider` (see `TodayPage`) so it
 * can read `state.selectedSlot`; `selectedSlot` always holds a real 0–47 index
 * (it defaults to the slot containing "now" — see `createInitialState`), so
 * there is no "nothing selected" branch to handle.
 */
export function ThemeFromSlot() {
  const { state } = useBoard()
  const { setTheme } = useTheme()
  const period = periodOfSlot(state.selectedSlot)

  useEffect(() => {
    setTheme(period === 'day' ? 'light' : 'dark')
  }, [period, setTheme])

  return null
}
