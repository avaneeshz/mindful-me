import { MAX_DICTATION_MS, type DictationErrorCode } from '@/domain/dictation'

/**
 * The ONLY file that touches MediaRecorder / getUserMedia /
 * navigator.mediaDevices (CLAUDE.md portability rule 2). A native app swaps
 * this module for its own recorder; everything above it is unchanged.
 */

export class RecorderError extends Error {
  readonly code: DictationErrorCode
  constructor(code: DictationErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'RecorderError'
    this.code = code
  }
}

export interface AudioRecorder {
  /** Asks for the microphone and starts recording. Rejects with a `RecorderError`. */
  start(): Promise<void>
  /** Stops and resolves the recorded clip. Releases the microphone. */
  stop(): Promise<Blob>
  /** Stops and discards. Always safe to call, any number of times. */
  cancel(): void
}

export interface RecorderOptions {
  /** Called once if the recorder hits its maximum length by itself. */
  onMaxDuration?: () => void
  maxDurationMs?: number
}

/** Preferred containers in order: Chrome/Firefox/Edge → webm/opus, iOS Safari → mp4, then ogg. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/** First candidate the browser can record, or `undefined` to let it choose. Pure; exported for tests. */
export function pickMimeType(isTypeSupported: (type: string) => boolean): string | undefined {
  return MIME_CANDIDATES.find((type) => isTypeSupported(type))
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

/** Maps a `getUserMedia` failure to our error vocabulary. Exported for tests. */
export function mapMediaError(error: unknown): RecorderError {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return new RecorderError('permission_denied')
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new RecorderError('no_microphone')
  return new RecorderError('recording_failed')
}

export function createAudioRecorder(options: RecorderOptions = {}): AudioRecorder {
  const maxMs = options.maxDurationMs ?? MAX_DICTATION_MS
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let limitTimer: ReturnType<typeof setTimeout> | null = null
  let starting = false

  function release() {
    if (limitTimer) clearTimeout(limitTimer)
    limitTimer = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    recorder = null
    chunks = []
  }

  return {
    async start() {
      if (!isRecordingSupported()) throw new RecorderError('unsupported')
      if (recorder || starting) return
      starting = true
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (error) {
        starting = false
        throw mapMediaError(error)
      }
      // Cancelled while the permission prompt was open.
      if (!starting) {
        release()
        return
      }
      try {
        const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
        chunks = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.start()
        limitTimer = setTimeout(() => options.onMaxDuration?.(), maxMs)
      } catch {
        release()
        starting = false
        throw new RecorderError('recording_failed')
      }
      starting = false
    },

    stop() {
      const active = recorder
      if (!active) return Promise.reject(new RecorderError('recording_failed', 'not recording'))
      return new Promise<Blob>((resolve, reject) => {
        const type = active.mimeType || pickMimeType((t) => MediaRecorder.isTypeSupported(t)) || 'audio/webm'
        active.onstop = () => {
          const blob = new Blob(chunks, { type })
          release()
          resolve(blob)
        }
        active.onerror = () => {
          release()
          reject(new RecorderError('recording_failed'))
        }
        try {
          if (active.state !== 'inactive') active.stop()
          else active.onstop?.(new Event('stop'))
        } catch {
          release()
          reject(new RecorderError('recording_failed'))
        }
      })
    },

    cancel() {
      starting = false
      if (recorder) {
        recorder.onstop = null
        recorder.ondataavailable = null
        try {
          if (recorder.state !== 'inactive') recorder.stop()
        } catch {
          // already stopped
        }
      }
      release()
    },
  }
}
