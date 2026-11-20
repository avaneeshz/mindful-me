import { supabase } from '@/lib/supabaseClient'
import type { DictationErrorCode } from '@/domain/dictation'

/**
 * Sends a recorded clip to the `transcribe` edge function, which holds the
 * speech-to-text key. Nothing is stored client-side or server-side. A native
 * app reuses this file unchanged; only the recorder differs.
 */

export class TranscribeError extends Error {
  readonly code: DictationErrorCode
  constructor(code: DictationErrorCode) {
    super(code)
    this.name = 'TranscribeError'
    this.code = code
  }
}

const SERVER_CODES: readonly DictationErrorCode[] = [
  'unauthorized',
  'not_configured',
  'rate_limited',
  'too_large',
  'unsupported_audio',
  'upstream_failed',
]

/** Whether a backend is configured at all (local-only mode has none, so no dictation). */
export function isTranscriptionAvailable(): boolean {
  return supabase !== null
}

export interface TranscribeInput {
  audio: Blob
  /** Clip length in ms, as measured by the caller. */
  durationMs: number
  /** Optional vocabulary hint (names, jargon). */
  prompt?: string
  /** ISO 639-1 code; omit to auto-detect. */
  language?: string
}

export async function apiTranscribe(input: TranscribeInput): Promise<{ text: string }> {
  if (!supabase) throw new TranscribeError('unavailable')

  const form = new FormData()
  form.append('audio', input.audio, 'dictation')
  form.append('seconds', String(Math.max(1, Math.ceil(input.durationMs / 1000))))
  if (input.prompt) form.append('prompt', input.prompt)
  if (input.language) form.append('language', input.language)

  const { data, error } = await supabase.functions.invoke('transcribe', { body: form })
  if (error) throw await toTranscribeError(error)

  const text = (data as { text?: unknown } | null)?.text
  if (typeof text !== 'string') throw new TranscribeError('upstream_failed')
  return { text }
}

/** Exported for tests: reads the `{ error }` code out of a failed invoke. */
export async function toTranscribeError(error: unknown): Promise<TranscribeError> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown }
      const code = SERVER_CODES.find((c) => c === body.error)
      if (code) return new TranscribeError(code)
    } catch {
      // not JSON — fall through
    }
    if (context.status === 401) return new TranscribeError('unauthorized')
    if (context.status === 429) return new TranscribeError('rate_limited')
    if (context.status === 413) return new TranscribeError('too_large')
    return new TranscribeError('unavailable')
  }
  // No response at all: the browser couldn't reach the server.
  return new TranscribeError('offline')
}
