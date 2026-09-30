import { useEffect } from 'react'
import { apiGetHealthConnectionStatus } from '@/api/healthSync'
import { isAutoSyncDue, nextAutoSyncDelay } from '@/domain/healthAutoSync'
import { isAppVisible, onAppVisibilityChange } from '@/lib/appVisibility'
import { runHealthSync } from '@/state/healthSyncRunner'

/** A beat after the app opens, so the first sync doesn't compete with the first render. */
const START_DELAY_MS = 3_000

/**
 * Keeps Google Health data fresh while the app is open: a sync shortly after
 * opening, again when the app comes back to the front, and every 5 minutes
 * while it stays visible. Each sync is `auto` — the server runs a light
 * "today" sync, or a full one when the last full sync is over 6 hours old.
 *
 * Nothing runs while the app is hidden, when no account is connected, or
 * while a sync is already going (the runner joins it). Failures back off
 * exponentially; a connection that needs re-authorizing stops being synced
 * until it is reconnected.
 */
export function useHealthAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let failures = 0
    let checking = false

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer)
      if (!stopped) timer = setTimeout(check, ms)
    }

    async function check() {
      if (stopped || checking) return
      // Hidden: do nothing now; the visibility listener picks it up on return.
      if (!isAppVisible()) return
      checking = true
      try {
        const status = await apiGetHealthConnectionStatus()
        if (stopped) return
        if (status?.status !== 'connected') {
          // Not connected (or needs reconnecting): check again later, cheaply.
          schedule(nextAutoSyncDelay(null, Date.now(), 0) * 2)
          return
        }
        if (!isAutoSyncDue(status.lastSyncedAt, Date.now())) {
          schedule(nextAutoSyncDelay(status.lastSyncedAt, Date.now(), 0))
          return
        }
        const outcome = await runHealthSync('auto')
        if (stopped) return
        failures = outcome.ok ? 0 : failures + 1
        schedule(nextAutoSyncDelay(outcome.ok ? new Date().toISOString() : null, Date.now(), failures))
      } finally {
        checking = false
      }
    }

    schedule(START_DELAY_MS)
    const unsubscribe = onAppVisibilityChange((visible) => {
      if (visible) schedule(0)
      else if (timer) clearTimeout(timer)
    })

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [enabled])
}
