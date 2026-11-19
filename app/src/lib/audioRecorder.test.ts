import { describe, expect, it } from 'vitest'
import { mapMediaError, pickMimeType } from './audioRecorder'

describe('pickMimeType', () => {
  it('prefers webm/opus where supported (Chrome, Firefox)', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('falls back to mp4 on iOS Safari, which cannot record webm', () => {
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns undefined when nothing is supported, so the browser picks', () => {
    expect(pickMimeType(() => false)).toBeUndefined()
  })
})

describe('mapMediaError', () => {
  const named = (name: string) => Object.assign(new Error('x'), { name })

  it('maps permission, missing-device and other failures', () => {
    expect(mapMediaError(named('NotAllowedError')).code).toBe('permission_denied')
    expect(mapMediaError(named('NotFoundError')).code).toBe('no_microphone')
    expect(mapMediaError(named('AbortError')).code).toBe('recording_failed')
    expect(mapMediaError('weird').code).toBe('recording_failed')
  })
})
