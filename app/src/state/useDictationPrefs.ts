import { useSyncExternalStore } from 'react'
import { getDictationPrefs, subscribeDictationPrefs, updateDictationPrefs } from '@/lib/dictationPrefs'
import type { DictationPrefs } from '@/domain/dictation'

export function useDictationPrefs(): DictationPrefs & {
  setEnabled: (enabled: boolean) => void
  markDisclosed: () => void
} {
  const prefs = useSyncExternalStore(subscribeDictationPrefs, getDictationPrefs, getDictationPrefs)
  return {
    ...prefs,
    setEnabled: (enabled) => updateDictationPrefs({ enabled }),
    markDisclosed: () => updateDictationPrefs({ disclosed: true }),
  }
}
