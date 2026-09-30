import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiDisconnectHealthConnection,
  apiGetHealthConnectionStatus,
  apiIsHealthConnectionRecoverable,
  apiListHealthDataTypeSummaries,
  apiRestoreHealthConnection,
  type HealthConnectionStatus,
  type HealthDataTypeSummary,
} from '@/api/healthSync'
import { beginGoogleHealthOAuthState, buildGoogleHealthAuthorizeUrl } from '@/lib/googleHealthOAuth'
import { useAuth } from '@/state/AuthContext'
import { onHealthSyncFinished, runHealthSync } from '@/state/healthSyncRunner'

export interface SyncMessage {
  tone: 'success' | 'error'
  text: string
}

/**
 * The one place the Google Health connection's state and actions live, shared
 * by Classic's Health Sync page and Lumen's Devices screen so the two
 * interfaces can't drift apart. Presentation stays in each interface.
 */
export function useHealthConnection() {
  const { configured } = useAuth()

  const [status, setStatus] = useState<HealthConnectionStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(configured)

  const [summaries, setSummaries] = useState<HealthDataTypeSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)

  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Rule 11 — a disconnect is recoverable for 30 days. `status === null`
  // covers BOTH "never connected" and "recently disconnected"; this tells the
  // two apart so the empty state can offer a real "Reconnect".
  const [recoverable, setRecoverable] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<SyncMessage | null>(null)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)

  const [disconnecting, setDisconnecting] = useState(false)

  const refresh = useCallback(async () => {
    const nextStatus = await apiGetHealthConnectionStatus()
    setStatus(nextStatus)
    setStatusLoading(false)
    if (nextStatus?.status === 'connected') {
      setSummariesLoading(true)
      const nextSummaries = await apiListHealthDataTypeSummaries()
      setSummaries(nextSummaries ?? [])
      setSummariesLoading(false)
      setRecoverable(false)
    } else {
      setSummaries([])
      setRecoverable(nextStatus ? false : await apiIsHealthConnectionRecoverable())
    }
  }, [])

  useEffect(() => {
    if (!configured) {
      setStatusLoading(false)
      return
    }
    refresh()
  }, [configured, refresh])

  const connect = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_HEALTH_CLIENT_ID as string | undefined
    if (!clientId) {
      setConnectError('Google Health isn’t configured for this environment yet — the OAuth client ID is missing.')
      return
    }
    setConnectError(null)
    setConnecting(true)
    const state = beginGoogleHealthOAuthState()
    window.location.href = buildGoogleHealthAuthorizeUrl(clientId, state)
  }, [])

  const syncNow = useCallback(async () => {
    if (syncing) return // rule 9's spirit — guard against a double-submit
    setSyncing(true)
    setSyncMessage(null)
    setSyncProgress(null)
    // Sync now is always a full sync. If an automatic one is running, the
    // runner lets it finish first rather than running two at once.
    const outcome = await runHealthSync('full', setSyncProgress)
    setSyncing(false)
    setSyncProgress(null)
    if (outcome.ok) {
      setSyncMessage({ tone: 'success', text: `Synced ${outcome.points} data point${outcome.points === 1 ? '' : 's'}.` })
    } else if (outcome.reason !== 'reauth_required') {
      setSyncMessage({ tone: 'error', text: outcome.message ?? 'Sync failed. Try again in a moment.' })
    }
    // The finished-sync listener below refreshes the screen.
  }, [syncing])

  // Any sync — this screen's or the app's automatic one — refreshes what's shown.
  useEffect(() => {
    if (!configured) return
    return onHealthSyncFinished(() => {
      void refresh()
    })
  }, [configured, refresh])

  // Connecting no longer runs a sync inside the sign-in request, so the first
  // one starts here: once, as soon as a connection exists that has never synced.
  const autoSyncStarted = useRef(false)
  useEffect(() => {
    if (autoSyncStarted.current) return
    if (status?.status !== 'connected' || status.lastSyncedAt) return
    autoSyncStarted.current = true
    void syncNow()
  }, [status, syncNow])

  const restore = useCallback(async () => {
    if (restoring) return
    setRestoring(true)
    setRestoreError(null)
    try {
      await apiRestoreHealthConnection()
      await refresh()
    } catch {
      setRestoreError('Could not reconnect — the 30-day window may have closed. Try connecting again instead.')
      setRecoverable(false)
    } finally {
      setRestoring(false)
    }
  }, [restoring, refresh])

  /** Resolves `true` when the disconnect went through. */
  const disconnect = useCallback(async (): Promise<boolean> => {
    setDisconnecting(true)
    try {
      await apiDisconnectHealthConnection()
      setStatus(null)
      setSummaries([])
      // Known true the instant the call succeeds — no second round trip needed.
      setRecoverable(true)
      return true
    } catch {
      setSyncMessage({ tone: 'error', text: 'Could not disconnect — try again.' })
      return false
    } finally {
      setDisconnecting(false)
    }
  }, [])

  return {
    configured,
    status,
    statusLoading,
    summaries,
    summariesLoading,
    connecting,
    connectError,
    recoverable,
    restoring,
    restoreError,
    syncing,
    syncMessage,
    syncProgress,
    disconnecting,
    refresh,
    connect,
    syncNow,
    restore,
    disconnect,
  }
}
