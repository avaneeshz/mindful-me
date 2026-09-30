import { apiTriggerHealthSync, type HealthSyncMode } from '@/api/healthSync'

/** Upper bound on calls in one sync — well above a real sync's step count. */
const MAX_SYNC_CALLS = 60

export interface HealthSyncOutcome {
  ok: boolean
  reason?: 'not_connected' | 'reauth_required' | 'sync_error'
  message?: string
  points: number
}

type Progress = (p: { done: number; total: number }) => void
type Listener = (outcome: HealthSyncOutcome) => void

let current: { mode: HealthSyncMode; promise: Promise<HealthSyncOutcome> } | null = null
const listeners = new Set<Listener>()

async function runLoop(mode: HealthSyncMode, onProgress?: Progress): Promise<HealthSyncOutcome> {
  // A sync is a series of small calls; the server returns where to resume and
  // which mode it settled on (`auto` becomes `full` or `quick`).
  let step = 0
  let points = 0
  let result = await apiTriggerHealthSync(step, mode)
  for (let calls = 1; result.ok && typeof result.nextStep === 'number' && calls < MAX_SYNC_CALLS; calls++) {
    points += result.pointsSynced ?? 0
    step = result.nextStep
    onProgress?.({ done: step, total: result.totalSteps ?? step })
    result = await apiTriggerHealthSync(step, result.mode ?? 'full')
  }
  if (result.ok) points += result.pointsSynced ?? 0
  return { ok: result.ok, reason: result.reason, message: result.message, points }
}

/**
 * Runs a Health Sync, never two at once. Asking while one is in flight joins
 * it — except asking for a `full` sync while a lighter one runs, which waits
 * for it and then runs the full one. Everyone subscribed hears each outcome,
 * so any screen showing health data refreshes after an automatic sync too.
 */
export function runHealthSync(mode: HealthSyncMode, onProgress?: Progress): Promise<HealthSyncOutcome> {
  if (current) {
    if (mode !== 'full' || current.mode === 'full') return current.promise
    const after = current.promise
    return after.then(() => runHealthSync(mode, onProgress))
  }
  const promise = runLoop(mode, onProgress)
    .catch((err): HealthSyncOutcome => ({ ok: false, reason: 'sync_error', message: err instanceof Error ? err.message : String(err), points: 0 }))
    .then((outcome) => {
      current = null
      for (const l of listeners) l(outcome)
      return outcome
    })
  current = { mode, promise }
  return promise
}

export function isHealthSyncRunning(): boolean {
  return current !== null
}

/** Hears the outcome of every sync, manual or automatic. Returns an unsubscribe. */
export function onHealthSyncFinished(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
