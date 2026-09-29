import { useCallback, useEffect, useState } from 'react'
import {
  apiDisconnectHealthConnection,
  apiGetHealthConnectionStatus,
  apiIsHealthConnectionRecoverable,
  apiListHealthDataTypeSummaries,
  apiRestoreHealthConnection,
  apiTriggerHealthSync,
  type HealthConnectionStatus,
  type HealthDataTypeSummary,
} from '@/api/healthSync'
import { beginGoogleHealthOAuthState, buildGoogleHealthAuthorizeUrl } from '@/lib/googleHealthOAuth'
import { useAuth } from '@/state/AuthContext'

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
    const result = await apiTriggerHealthSync()
    setSyncing(false)
    if (result.ok) {
      setSyncMessage({
        tone: 'success',
        text: `Synced ${result.pointsSynced ?? 0} new data point${result.pointsSynced === 1 ? '' : 's'}.`,
      })
      refresh()
    } else if (result.reason === 'reauth_required') {
      await refresh()
    } else {
      setSyncMessage({ tone: 'error', text: result.message ?? 'Sync failed. Try again in a moment.' })
    }
  }, [syncing, refresh])

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
    disconnecting,
    refresh,
    connect,
    syncNow,
    restore,
    disconnect,
  }
}
