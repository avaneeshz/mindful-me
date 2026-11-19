import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecorderError, type AudioRecorder } from '@/lib/audioRecorder'
import { TranscribeError } from '@/api/transcribe'
import { DictationController, type DictationDeps } from './dictationController'

function fakeRecorder(over: Partial<{ startError: Error; blob: Blob }> = {}) {
  const r = {
    started: false,
    cancelled: false,
    start: vi.fn(async () => {
      if (over.startError) throw over.startError
      r.started = true
    }),
    stop: vi.fn(async () => over.blob ?? new Blob(['x'], { type: 'audio/webm' })),
    cancel: vi.fn(() => {
      r.cancelled = true
    }),
  }
  return r satisfies AudioRecorder & Record<string, unknown>
}

function setup(over: { recorder?: ReturnType<typeof fakeRecorder>; transcribe?: DictationDeps['transcribe']; online?: boolean } = {}) {
  let clock = 1_000
  let visibility: ((visible: boolean) => void) | null = null
  const recorder = over.recorder ?? fakeRecorder()
  const deps: DictationDeps = {
    createRecorder: vi.fn(() => recorder),
    transcribe: over.transcribe ?? vi.fn(async () => ({ text: ' hello world ' })),
    now: () => clock,
    isOnline: () => over.online ?? true,
    onVisibilityChange: (h) => {
      visibility = h
      return () => {
        visibility = null
      }
    },
  }
  const onText = vi.fn()
  const controller = new DictationController(deps, { onText, vocabularyHint: 'Ava', language: undefined })
  return {
    controller,
    deps,
    recorder,
    onText,
    advance: (ms: number) => {
      clock += ms
      vi.advanceTimersByTime(ms)
    },
    hide: () => visibility?.(false),
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('DictationController', () => {
  it('records, transcribes and delivers trimmed text', async () => {
    const t = setup()
    await t.controller.toggle()
    expect(t.controller.getSnapshot().status).toBe('recording')
    t.advance(2_000)
    expect(t.controller.getSnapshot().elapsedMs).toBe(2_000)
    await t.controller.toggle()
    expect(t.controller.getSnapshot()).toEqual({ status: 'idle', error: null, elapsedMs: 0 })
    expect(t.onText).toHaveBeenCalledWith('hello world')
    expect(t.deps.transcribe).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 2_000, prompt: 'Ava' }))
  })

  it('shows transcribing while the request is in flight', async () => {
    let finish!: (v: { text: string }) => void
    const t = setup({ transcribe: () => new Promise((r) => (finish = r)) })
    await t.controller.toggle()
    t.advance(1_000)
    const stopping = t.controller.toggle()
    await vi.waitFor(() => expect(t.controller.getSnapshot().status).toBe('transcribing'))
    // A second tap while transcribing does nothing.
    await t.controller.toggle()
    expect(t.controller.getSnapshot().status).toBe('transcribing')
    finish({ text: 'done' })
    await stopping
    expect(t.onText).toHaveBeenCalledWith('done')
  })

  it.each([
    ['permission', new RecorderError('permission_denied'), 'permission_denied'],
    ['no mic', new RecorderError('no_microphone'), 'no_microphone'],
    ['unsupported', new RecorderError('unsupported'), 'unsupported'],
    ['other', new Error('boom'), 'recording_failed'],
  ])('maps a start failure (%s)', async (_n, err, code) => {
    const t = setup({ recorder: fakeRecorder({ startError: err }) })
    await t.controller.toggle()
    expect(t.controller.getSnapshot()).toEqual({ status: 'error', error: code, elapsedMs: 0 })
  })

  it('maps server errors, and unknown ones to unavailable', async () => {
    for (const [err, code] of [
      [new TranscribeError('rate_limited'), 'rate_limited'],
      [new TranscribeError('offline'), 'offline'],
      [new Error('weird'), 'unavailable'],
    ] as const) {
      const t = setup({ transcribe: async () => { throw err } })
      await t.controller.toggle()
      t.advance(1_000)
      await t.controller.toggle()
      expect(t.controller.getSnapshot().error).toBe(code)
      expect(t.onText).not.toHaveBeenCalled()
    }
  })

  it('does not call the server when offline, for a blip, or for empty audio', async () => {
    const offline = setup({ online: false })
    await offline.controller.toggle()
    offline.advance(1_000)
    await offline.controller.toggle()
    expect(offline.controller.getSnapshot().error).toBe('offline')
    expect(offline.deps.transcribe).not.toHaveBeenCalled()

    const blip = setup()
    await blip.controller.toggle()
    blip.advance(100)
    await blip.controller.toggle()
    expect(blip.controller.getSnapshot().error).toBe('empty')
    expect(blip.deps.transcribe).not.toHaveBeenCalled()

    const silent = setup({ recorder: fakeRecorder({ blob: new Blob([]) }) })
    await silent.controller.toggle()
    silent.advance(1_000)
    await silent.controller.toggle()
    expect(silent.controller.getSnapshot().error).toBe('empty')
  })

  it('treats a blank transcript as nothing heard', async () => {
    const t = setup({ transcribe: async () => ({ text: '   ' }) })
    await t.controller.toggle()
    t.advance(1_000)
    await t.controller.toggle()
    expect(t.controller.getSnapshot().error).toBe('empty')
    expect(t.onText).not.toHaveBeenCalled()
  })

  it('cancel discards a recording without transcribing', async () => {
    const t = setup()
    await t.controller.toggle()
    t.controller.cancel()
    expect(t.recorder.cancel).toHaveBeenCalled()
    expect(t.controller.getSnapshot().status).toBe('idle')
    expect(t.deps.transcribe).not.toHaveBeenCalled()
  })

  it('cancel while transcribing ignores the late result', async () => {
    let finish!: (v: { text: string }) => void
    const t = setup({ transcribe: () => new Promise((r) => (finish = r)) })
    await t.controller.toggle()
    t.advance(1_000)
    const stopping = t.controller.toggle()
    await vi.waitFor(() => expect(t.controller.getSnapshot().status).toBe('transcribing'))
    t.controller.cancel()
    finish({ text: 'late' })
    await stopping
    expect(t.onText).not.toHaveBeenCalled()
    expect(t.controller.getSnapshot().status).toBe('idle')
  })

  it('stops and transcribes when the app is hidden', async () => {
    const t = setup()
    await t.controller.toggle()
    t.advance(1_500)
    t.hide()
    await vi.waitFor(() => expect(t.onText).toHaveBeenCalledWith('hello world'))
  })

  it('stops itself at the maximum length (recorder callback)', async () => {
    const t = setup()
    await t.controller.toggle()
    const options = (t.deps.createRecorder as ReturnType<typeof vi.fn>).mock.calls[0][0]
    t.advance(120_000)
    options.onMaxDuration()
    await vi.waitFor(() => expect(t.onText).toHaveBeenCalled())
  })

  it('allows one recording at a time: starting another stops the first', async () => {
    const a = setup()
    const b = setup()
    await a.controller.toggle()
    a.advance(1_000)
    await b.controller.toggle()
    await vi.waitFor(() => expect(a.onText).toHaveBeenCalled())
    expect(b.controller.getSnapshot().status).toBe('recording')
    b.controller.cancel()
  })

  it('dispose stops recording and ignores later results', async () => {
    const t = setup()
    await t.controller.toggle()
    t.controller.dispose()
    expect(t.recorder.cancel).toHaveBeenCalled()
    expect(t.onText).not.toHaveBeenCalled()
  })

  it('dismissError returns to idle, and a new tap starts fresh', async () => {
    const t = setup({ recorder: fakeRecorder({ startError: new RecorderError('permission_denied') }) })
    await t.controller.toggle()
    t.controller.dismissError()
    expect(t.controller.getSnapshot().status).toBe('idle')
  })
})
