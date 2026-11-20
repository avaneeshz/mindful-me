import { describe, expect, it } from 'vitest'
import { toTranscribeError } from './transcribe'

const httpError = (status: number, body: unknown) => ({
  context: new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
})

describe('toTranscribeError', () => {
  it('reads the server error code', async () => {
    expect((await toTranscribeError(httpError(429, { error: 'rate_limited' }))).code).toBe('rate_limited')
    expect((await toTranscribeError(httpError(415, { error: 'unsupported_audio' }))).code).toBe('unsupported_audio')
    expect((await toTranscribeError(httpError(500, { error: 'not_configured' }))).code).toBe('not_configured')
  })

  it('falls back to the HTTP status when the body has no known code', async () => {
    expect((await toTranscribeError(httpError(401, 'nope'))).code).toBe('unauthorized')
    expect((await toTranscribeError(httpError(413, {}))).code).toBe('too_large')
    expect((await toTranscribeError(httpError(500, { error: 'weird' }))).code).toBe('unavailable')
  })

  it('treats an error with no response as offline', async () => {
    expect((await toTranscribeError(new Error('Failed to send a request'))).code).toBe('offline')
  })
})
