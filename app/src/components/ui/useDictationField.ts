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
}

/**
 * The shared behaviour behind every mic button — classic and Lumen only differ
 * in how it looks. Wraps `useDictation` with the DOM-side parts: inserting at
 * the cursor, Escape to cancel, and clearing an error after a few seconds.
 */
export function useDictationField({ getTarget, vocabularyHint, disabled = false }: UseDictationFieldOptions): DictationField {
  const [notice, setNotice] = useState<string | null>(null)
  const dictation = useDictation({
    vocabularyHint,
    onText: (text) => {
      const target = getTarget()
      if (!target) return
      const outcome = insertIntoField(target, text)
      if (outcome === 'full') setNotice('This note is full, so what you said was not added.')
      else if (outcome === 'truncated') setNotice('This note is full — the end of what you said was left out.')
    },
  })
  const { status, cancel, dismissError, toggle } = dictation
  const prefs = useDictationPrefs()

  useEffect(() => {
    if (status !== 'recording') return
    // Window + capture phase runs before a surrounding dialog's own Escape
    // handling, so the first Escape only cancels the recording and never also
    // closes the dialog the field lives in.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [status, cancel])

  const message = dictation.errorMessage ?? notice
  const dismissMessage = useCallback(() => {
    dismissError()
    setNotice(null)
  }, [dismissError])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(dismissMessage, ERROR_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [message, dismissMessage])

  const onPress = useCallback(() => {
    setNotice(null)
    if (isFieldLocked(getTarget())) return
    toggle()
  }, [getTarget, toggle])

  return {
    ...dictation,
    errorMessage: message,
    dismissError: dismissMessage,
    visible: dictation.supported && prefs.enabled && !disabled,
    onPress,
  }
}
