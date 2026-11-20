import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { dictationErrorMessage, type DictationErrorCode, type DictationStatus } from '@/domain/dictation'
import { apiTranscribe, isTranscriptionAvailable } from '@/api/transcribe'
import { onAppVisibilityChange } from '@/lib/appVisibility'
import { isOnline } from '@/lib/connectivity'
import { createAudioRecorder, isRecordingSupported } from '@/lib/audioRecorder'
import { VOICE_DICTATION_ENABLED } from '@/lib/featureFlags'
import { DictationController, type DictationDeps } from './dictationController'

export interface UseDictationOptions {
  /** Called with the transcript once, after a recording is transcribed. */
  onText: (text: string) => void
  /** Names or jargon the speech engine should expect (kept short). */
  vocabularyHint?: string
  /** ISO 639-1 code. Omit to auto-detect (the default — handles Hindi/English mixes). */
  language?: string
}

export interface UseDictation {
  status: DictationStatus
  error: DictationErrorCode | null
  /** Plain-language text for `error`, or null. */
  errorMessage: string | null
  elapsedMs: number
  /** False when the browser can't record, the feature is off, or there is no backend. */
  supported: boolean
  toggle: () => void
  cancel: () => void
  dismissError: () => void
}

const defaultDeps: DictationDeps = {
  createRecorder: createAudioRecorder,
  transcribe: apiTranscribe,
  now: () => Date.now(),
  isOnline,
  onVisibilityChange: onAppVisibilityChange,
}

/**
 * Voice dictation for one field. The engine (Groq Whisper today) lives behind
 * this hook, so swapping in an on-device model later changes `deps`, not UI.
 */
export function useDictation(options: UseDictationOptions, deps: DictationDeps = defaultDeps): UseDictation {
  const controller = useMemo(() => new DictationController(deps, options), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    controller.setOptions(options)
  })
  // Stop recording and drop callbacks when the field goes away.
  useEffect(() => () => controller.dispose(), [controller])

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)

  return {
    ...snapshot,
    errorMessage: snapshot.error ? dictationErrorMessage(snapshot.error) : null,
    supported: VOICE_DICTATION_ENABLED && isRecordingSupported() && isTranscriptionAvailable(),
    toggle: useCallback(() => void controller.toggle(), [controller]),
    cancel: useCallback(() => controller.cancel(), [controller]),
    dismissError: useCallback(() => controller.dismissError(), [controller]),
  }
}
