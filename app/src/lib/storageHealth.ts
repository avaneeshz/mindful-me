import { persistRequestMayPrompt } from './browserInfo'

/**
 * How safe this device's storage is, as far as the browser lets us know.
 * One module-level store (like `activityLogger`) so the layer that writes and
 * the screens that warn don't need a provider between them.
 *
 *  - `persistence` — whether the browser agreed to treat this site's data as
 *    protected from automatic clean-up. `unknown` until asked (and always for
 *    Firefox, which would show the user a prompt).
 *  - `ledgerSaveFailed` — the last attempt to save the unsynced-changes list on
 *    this device failed (storage full or blocked). Those changes are then only
 *    in memory and would be lost on reload.
 */
export type Persistence = 'granted' | 'denied' | 'unsupported' | 'unknown'

export interface StorageHealth {
  persistence: Persistence
  ledgerSaveFailed: boolean
}

let health: StorageHealth = { persistence: 'unknown', ledgerSaveFailed: false }
const listeners = new Set<() => void>()

function update(patch: Partial<StorageHealth>): void {
  const next = { ...health, ...patch }
  if (next.persistence === health.persistence && next.ledgerSaveFailed === health.ledgerSaveFailed) return
  health = next
  for (const listener of listeners) listener()
}

export function setLedgerSaveFailed(failed: boolean): void {
  update({ ledgerSaveFailed: failed })
}

/**
 * Asks the browser to keep this site's data through low-storage clean-ups. It
 * is a request, not a promise: the answer is recorded so the app can warn when
 * it is "no". Safe to call repeatedly.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      update({ persistence: 'unsupported' })
      return
    }
    if (await navigator.storage.persisted?.()) {
      update({ persistence: 'granted' })
      return
    }
    if (persistRequestMayPrompt()) return // stays `unknown`: no surprise prompt
    update({ persistence: (await navigator.storage.persist()) ? 'granted' : 'denied' })
  } catch {
    update({ persistence: 'unsupported' })
  }
}

export function subscribeStorageHealth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getStorageHealth(): StorageHealth {
  return health
}

/** Test seam. */
export function resetStorageHealthForTests(): void {
  health = { persistence: 'unknown', ledgerSaveFailed: false }
}
