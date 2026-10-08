import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import type { PendingWrites } from './pendingWritesQueue'

/**
 * Device persistence for the pending-writes ledger. GLOBAL (not per day or per
 * screen): a change must survive a reload, navigating away, and signing out —
 * each entry carries its owner, so signing in as someone else never replays
 * it into the wrong account, and signing back in picks it up again.
 *
 * No expiry, no pruning: this file only ever stores what it is given.
 */
const KEY = 'mindful-me:pendingWrites:v1'

export function loadPendingWrites(): PendingWrites {
  const stored = readStoredJSON(KEY)
  return Array.isArray(stored) ? (stored as PendingWrites) : []
}

export function savePendingWrites(queue: PendingWrites): void {
  writeStoredJSON(KEY, queue)
}

/**
 * Device-made id -> server id, for records whose server assigns its own id
 * (notes). Lets a later edit or delete of a note that was first saved offline
 * still find it. Small, and — like the ledger — never expires.
 */
const ID_MAP_KEY = 'mindful-me:pendingWrites:idMap:v1'

export function loadIdMap(): Record<string, string> {
  const stored = readStoredJSON(ID_MAP_KEY)
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, string>) : {}
}

export function saveIdMap(map: Record<string, string>): void {
  writeStoredJSON(ID_MAP_KEY, map)
}
