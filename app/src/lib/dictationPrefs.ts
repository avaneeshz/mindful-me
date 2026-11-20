import { DEFAULT_DICTATION_PREFS, parseDictationPrefs, type DictationPrefs } from '@/domain/dictation'
import { readStoredJSON, writeStoredJSON } from '@/lib/storage'

/**
 * Dictation on/off and the one-time notice, stored through the storage
 * adapter. A tiny observable store so Settings and every mic stay in sync
 * within the page without a context provider.
 */
const KEY = 'mindful-me:dictation-prefs'

let current: DictationPrefs | null = null
const listeners = new Set<() => void>()

export function getDictationPrefs(): DictationPrefs {
  if (!current) current = parseDictationPrefs(readStoredJSON(KEY) ?? DEFAULT_DICTATION_PREFS)
  return current
}

export function updateDictationPrefs(patch: Partial<DictationPrefs>): void {
  current = { ...getDictationPrefs(), ...patch }
  writeStoredJSON(KEY, current)
  listeners.forEach((listener) => listener())
}

export function subscribeDictationPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
