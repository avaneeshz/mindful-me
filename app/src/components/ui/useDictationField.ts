import { useCallback, useEffect, useState } from 'react'
import { useDictationPrefs } from '@/state/useDictationPrefs'
import { useDictation, type UseDictation } from '@/state/useDictation'
import { insertIntoField, isFieldLocked, type TextFieldElement } from './insertIntoField'

const ERROR_VISIBLE_MS = 8_000

export interface UseDictationFieldOptions {
  /** The text field the transcript goes into. Read at the moment it is needed. */
  getTarget: () => TextFieldElement | null
  vocabularyHint?: string
  /** The field is temporarily not editable (saving, locked…): no mic. */
  disabled?: boolean
}

export interface DictationField extends UseDictation {
  /** Whether to render a mic at all. */
  visible: boolean
  onPress: () => void
  /** The one-time "audio goes to a speech service" notice. */
  disclosure: { open: boolean; accept: () => void; decline: () => void }
}

/**
 * The shared behaviour behind every mic button — classic and Lumen only differ
 * in how it looks. Wraps `useDictation` with the DOM-side parts: inserting at
 * the cursor, Escape to cancel, and clearing an error after a few seconds.
 */
export function useDictationField({ getTarget, vocabularyHint, disabled = false }: UseDictationFieldOptions): DictationField {
  const dictation = useDictation({
    vocabularyHint,
    onText: (text) => {
      const target = getTarget()
      if (target) insertIntoField(target, text)
    },
  })
  const { status, error, cancel, dismissError, toggle } = dictation
  const prefs = useDictationPrefs()
  const [disclosureOpen, setDisclosureOpen] = useState(false)

  useEffect(() => {
    if (status !== 'recording') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [status, cancel])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(dismissError, ERROR_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [error, dismissError])

  const onPress = useCallback(() => {
    if (isFieldLocked(getTarget())) return
    if (!prefs.disclosed) {
      setDisclosureOpen(true)
      return
    }
    toggle()
  }, [getTarget, toggle, prefs.disclosed])

  const accept = useCallback(() => {
    prefs.markDisclosed()
    setDisclosureOpen(false)
    // The tap on "Allow" is itself the user gesture the microphone prompt needs.
    toggle()
  }, [prefs, toggle])
  const decline = useCallback(() => setDisclosureOpen(false), [])

  return {
    ...dictation,
    visible: dictation.supported && prefs.enabled && !disabled,
    onPress,
    disclosure: { open: disclosureOpen, accept, decline },
  }
}
