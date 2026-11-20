import { MAX_DICTATION_MS, type DictationErrorCode, type DictationStatus } from '@/domain/dictation'
import { RecorderError, type AudioRecorder, type RecorderOptions } from '@/lib/audioRecorder'
import { TranscribeError, type TranscribeInput } from '@/api/transcribe'

/**
 * The dictation state machine — framework-free so it is unit-tested without a
 * DOM and carries over to a native app. `useDictation` is a thin React wrapper.
 *
 *   idle ──start──▶ recording ──stop──▶ transcribing ──▶ idle
 *     ▲                │                      │
 *     └──── cancel ────┴──────────────────────┘     any failure ──▶ error
 *
 * Only one controller records at a time, app-wide: starting a second one stops
 * (and transcribes) the first.
 */

export interface DictationSnapshot {
  status: DictationStatus
  error: DictationErrorCode | null
  elapsedMs: number
}

export interface DictationDeps {
  createRecorder: (options: RecorderOptions) => AudioRecorder
  transcribe: (input: TranscribeInput) => Promise<{ text: string }>
  now: () => number
  isOnline: () => boolean
  /** Calls the handler when the app is hidden/shown; returns an unsubscribe. */
  onVisibilityChange: (handler: (visible: boolean) => void) => () => void
}

export interface DictationOptions {
  onText: (text: string) => void
  vocabularyHint?: string
  language?: string
}

/** Clips shorter than this are treated as an accidental tap, not speech. */
export const MIN_CLIP_MS = 400
const TICK_MS = 250

let activeController: DictationController | null = null

export class DictationController {
  private snapshot: DictationSnapshot = { status: 'idle', error: null, elapsedMs: 0 }
  private listeners = new Set<() => void>()
  private recorder: AudioRecorder | null = null
  private startedAt = 0
  private ticker: ReturnType<typeof setInterval> | null = null
  private unwatchVisibility: (() => void) | null = null
  /** Bumped on every start/cancel so stale async results are ignored. */
  private run = 0
  private starting = false

  constructor(
    private deps: DictationDeps,
    private options: DictationOptions,
  ) {}

  setOptions(options: DictationOptions) {
    this.options = options
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): DictationSnapshot => this.snapshot

  toggle(): Promise<void> {
    if (this.snapshot.status === 'recording') return this.stop()
    if (this.snapshot.status === 'transcribing' || this.starting) return Promise.resolve()
    return this.start()
  }

  async start(): Promise<void> {
    if (this.starting || this.snapshot.status === 'recording' || this.snapshot.status === 'transcribing') return
    if (activeController && activeController !== this) void activeController.stop()

    const run = ++this.run
    this.starting = true
    this.set({ status: 'idle', error: null, elapsedMs: 0 })
    const recorder = this.deps.createRecorder({ maxDurationMs: MAX_DICTATION_MS, onMaxDuration: () => void this.stop() })
    this.recorder = recorder
    try {
      await recorder.start()
    } catch (error) {
      if (run !== this.run) return
      this.starting = false
      this.recorder = null
      recorder.cancel()
      this.set({ status: 'error', error: error instanceof RecorderError ? error.code : 'recording_failed', elapsedMs: 0 })
      return
    }
    this.starting = false
    if (run !== this.run) {
      recorder.cancel()
      return
    }

    activeController = this
    this.startedAt = this.deps.now()
    this.set({ status: 'recording', error: null, elapsedMs: 0 })
    this.ticker = setInterval(() => this.set({ ...this.snapshot, elapsedMs: this.deps.now() - this.startedAt }), TICK_MS)
    this.unwatchVisibility = this.deps.onVisibilityChange((visible) => {
      if (!visible) void this.stop()
    })
  }

  async stop(): Promise<void> {
    const recorder = this.recorder
    if (this.snapshot.status !== 'recording' || !recorder) return
    const run = this.run
    const durationMs = this.deps.now() - this.startedAt
    this.endRecording()
    this.set({ status: 'transcribing', error: null, elapsedMs: durationMs })

    try {
      const audio = await recorder.stop()
      if (run !== this.run) return
      if (audio.size === 0 || durationMs < MIN_CLIP_MS) return this.fail('empty')
      if (!this.deps.isOnline()) return this.fail('offline')

      const { text } = await this.deps.transcribe({
        audio,
        durationMs,
        prompt: this.options.vocabularyHint,
        language: this.options.language,
      })
      if (run !== this.run) return
      const spoken = text.trim()
      if (!spoken) return this.fail('empty')
      this.set({ status: 'idle', error: null, elapsedMs: 0 })
      this.options.onText(spoken)
    } catch (error) {
      if (run !== this.run) return
      this.fail(
        error instanceof TranscribeError || error instanceof RecorderError ? error.code : 'unavailable',
      )
    }
  }

  /** Discards a recording in progress, or ignores a transcription in flight. */
  cancel() {
    this.run++
    this.starting = false
    this.endRecording()
    this.recorder?.cancel()
    this.recorder = null
    if (this.snapshot.status !== 'idle' || this.snapshot.error) this.set({ status: 'idle', error: null, elapsedMs: 0 })
  }

  dismissError() {
    if (this.snapshot.status === 'error') this.set({ status: 'idle', error: null, elapsedMs: 0 })
  }

  /** Call on unmount: nothing may keep recording or call back afterwards. */
  dispose() {
    this.cancel()
    this.listeners.clear()
  }

  private fail(code: DictationErrorCode) {
    this.set({ status: 'error', error: code, elapsedMs: 0 })
  }

  private endRecording() {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
    this.unwatchVisibility?.()
    this.unwatchVisibility = null
    if (activeController === this) activeController = null
  }

  private set(next: DictationSnapshot) {
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }
}
