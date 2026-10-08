import type { Persistence } from '@/lib/storageHealth'

/**
 * When — and only when — the user should be told their unsynced changes are at
 * risk. Pure, so every rule and its wording is tested. The principle: a warning
 * appears only when there is something to lose (a change the server has not
 * confirmed) AND a real reason it could be lost. A synced user is never nagged.
 */
export const LONG_UNSYNCED_MS = 3 * 24 * 60 * 60 * 1000

export interface StorageWarningInput {
  pendingCount: number
  /** Epoch ms of the oldest unconfirmed change, or null when there are none. */
  oldestPendingAt: number | null
  now: number
  ledgerSaveFailed: boolean
  persistence: Persistence
  /** Safari-style storage clean-up applies (see `isStorageEvictionRisk`). */
  evictionRisk: boolean
}

export interface StorageWarning {
  id: 'cannot-save' | 'long-unsynced' | 'not-protected'
  severity: 'urgent' | 'notice'
  title: string
  body: string
}

export function storageWarnings(input: StorageWarningInput): StorageWarning[] {
  if (input.pendingCount === 0) return []
  const warnings: StorageWarning[] = []

  if (input.ledgerSaveFailed) {
    warnings.push({
      id: 'cannot-save',
      severity: 'urgent',
      title: 'Your waiting changes can’t be saved on this device',
      body: 'This device’s storage is full or blocked, so changes that haven’t reached your account yet will be lost if you reload or close the app. Stay online and keep this page open until they sync, or free up space.',
    })
  }

  if (input.oldestPendingAt !== null && input.now - input.oldestPendingAt >= LONG_UNSYNCED_MS) {
    const days = Math.floor((input.now - input.oldestPendingAt) / (24 * 60 * 60 * 1000))
    warnings.push({
      id: 'long-unsynced',
      severity: 'urgent',
      title: `A change has been waiting to sync for ${days} days`,
      body: input.evictionRisk
        ? 'Safari can delete a website’s stored data after about a week without use, and these changes only exist on this device. Open the app while online so they can sync, and consider adding it to your Home Screen.'
        : 'These changes only exist on this device until they sync. Open the app while online so they can sync, or open Not synced to see why they are stuck.',
    })
  }

  if (input.persistence === 'denied' || input.persistence === 'unsupported') {
    warnings.push({
      id: 'not-protected',
      severity: 'notice',
      title: 'This browser may clear data it thinks you don’t need',
      body: 'It didn’t agree to keep this app’s data protected, so changes waiting to sync could be removed if the device runs low on space. Getting back online soon lets them sync.',
    })
  }

  return warnings
}
