import { useSyncExternalStore } from 'react'
import { getPendingWritesSnapshot, subscribePendingWrites } from './pendingWrites'
import type { PendingWrite } from './pendingWritesQueue'

/** The signed-in user's changes the server has not confirmed yet. Live. */
export function usePendingWrites(): readonly PendingWrite[] {
  return useSyncExternalStore(subscribePendingWrites, getPendingWritesSnapshot, getPendingWritesSnapshot)
}
