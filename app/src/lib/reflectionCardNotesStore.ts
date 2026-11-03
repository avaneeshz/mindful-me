import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import { parseCardNotes, type ReflectionCardNote } from '@/domain/reflectionCardNotes'

/**
 * Device cache of one account's notes on one tile, so the history shows
 * instantly (and offline). Keyed by account. Without a backend this is the
 * only copy; with one, the server is the source of truth.
 */
const keyFor = (owner: string, card: number) => `mindful-me:state-tile-notes:${owner}:${card}`

export function loadCardNotes(owner: string, card: number): ReflectionCardNote[] {
  return parseCardNotes(readStoredJSON(keyFor(owner, card)))
}

export function saveCardNotes(owner: string, card: number, notes: readonly ReflectionCardNote[]): void {
  writeStoredJSON(keyFor(owner, card), notes)
}
