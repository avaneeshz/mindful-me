import { describe, expect, it } from 'vitest'
import {
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_PROMPT_CHARS,
  audioExtension,
  billableSeconds,
  checkAudio,
  mapUpstreamStatus,
  normalizeLanguage,
  parseQuotaResult,
  rateLimitedMessage,
  resolveModel,
  sanitizePrompt,
  shouldReleaseQuota,
} from './transcription.ts'

describe('audioExtension', () => {
  it('maps what Chrome, Firefox and iOS Safari record', () => {
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm')
    expect(audioExtension('audio/webm')).toBe('webm')
    expect(audioExtension('audio/mp4')).toBe('mp4')
    expect(audioExtension('audio/ogg; codecs=opus')).toBe('ogg')
    expect(audioExtension('Audio/WAV')).toBe('wav')
  })

  it('rejects non-audio and unknown audio types', () => {
    expect(audioExtension('video/webm')).toBeNull()
    expect(audioExtension('application/json')).toBeNull()
    expect(audioExtension('audio/x-unknown')).toBeNull()
    expect(audioExtension('')).toBeNull()
    expect(audioExtension(null)).toBeNull()
  })
})

describe('checkAudio', () => {
  it('accepts a normal clip', () => {
    expect(checkAudio('audio/webm;codecs=opus', 50_000)).toEqual({ ok: true, extension: 'webm' })
    expect(checkAudio('audio/mp4', MAX_AUDIO_BYTES)).toEqual({ ok: true, extension: 'mp4' })
  })

  it('rejects empty audio', () => {
    expect(checkAudio('audio/webm', 0)).toMatchObject({ ok: false, error: 'unsupported_audio' })
    expect(checkAudio('audio/webm', Number.NaN)).toMatchObject({ ok: false, error: 'unsupported_audio' })
  })

  it('rejects oversize audio', () => {
    expect(checkAudio('audio/webm', MAX_AUDIO_BYTES + 1)).toMatchObject({ ok: false, error: 'too_large' })
  })

  it('rejects a non-audio content type before checking size', () => {
    expect(checkAudio('text/plain', MAX_AUDIO_BYTES + 1)).toMatchObject({ ok: false, error: 'unsupported_audio' })
  })
})

describe('billableSeconds', () => {
  it('uses the client-reported length, rounded up', () => {
    expect(billableSeconds('12.2', 1)).toBe(13)
    expect(billableSeconds(5, 1)).toBe(5)
  })

  it('clamps to the maximum and minimum', () => {
    expect(billableSeconds('9999', 1)).toBe(MAX_AUDIO_SECONDS)
    expect(billableSeconds('0.1', 1)).toBe(1)
  })

  it('estimates from size when the claim is missing or nonsense', () => {
    expect(billableSeconds(null, 160_000)).toBe(10)
    expect(billableSeconds('abc', 160_000)).toBe(10)
    expect(billableSeconds('-4', 160_000)).toBe(10)
    expect(billableSeconds(undefined, 1)).toBe(1)
    expect(billableSeconds(null, MAX_AUDIO_BYTES)).toBe(MAX_AUDIO_SECONDS)
  })
})

describe('sanitizePrompt', () => {
  it('collapses whitespace and trims', () => {
    expect(sanitizePrompt('  Ava \n\n Keshri   Diwali ')).toBe('Ava Keshri Diwali')
  })

  it('caps the length', () => {
    expect(sanitizePrompt('a'.repeat(MAX_PROMPT_CHARS + 100))?.length).toBe(MAX_PROMPT_CHARS)
  })

  it('returns null for empty or non-string input', () => {
    expect(sanitizePrompt('   ')).toBeNull()
    expect(sanitizePrompt(null)).toBeNull()
    expect(sanitizePrompt(42)).toBeNull()
  })
})

describe('normalizeLanguage', () => {
  it('accepts two-letter codes, case-insensitively', () => {
    expect(normalizeLanguage('hi')).toBe('hi')
    expect(normalizeLanguage(' EN ')).toBe('en')
  })

  it('treats anything else as auto-detect', () => {
    expect(normalizeLanguage('')).toBeNull()
    expect(normalizeLanguage('english')).toBeNull()
    expect(normalizeLanguage('en-IN')).toBeNull()
    expect(normalizeLanguage(undefined)).toBeNull()
  })
})

describe('resolveModel', () => {
  it('defaults to the turbo model', () => {
    expect(resolveModel(undefined)).toBe('whisper-large-v3-turbo')
    expect(resolveModel('')).toBe('whisper-large-v3-turbo')
  })

  it('allows the configured alternative and ignores unknown values', () => {
    expect(resolveModel('whisper-large-v3')).toBe('whisper-large-v3')
    expect(resolveModel('gpt-4o')).toBe('whisper-large-v3-turbo')
  })
})

describe('parseQuotaResult', () => {
  it('parses an allowed reservation', () => {
    expect(parseQuotaResult({ allowed: true, usage_id: 'abc' })).toEqual({ allowed: true, usageId: 'abc' })
  })

  it('parses both denial reasons with retry-after', () => {
    expect(parseQuotaResult({ allowed: false, reason: 'hourly_requests', retry_after_seconds: 120 })).toEqual({
      allowed: false,
      reason: 'hourly_requests',
      retryAfterSeconds: 120,
    })
    expect(parseQuotaResult({ allowed: false, reason: 'daily_seconds' })).toEqual({
      allowed: false,
      reason: 'daily_seconds',
      retryAfterSeconds: undefined,
    })
  })

  it('returns null for anything unexpected, so the caller fails closed', () => {
    expect(parseQuotaResult(null)).toBeNull()
    expect(parseQuotaResult('ok')).toBeNull()
    expect(parseQuotaResult({ allowed: true })).toBeNull()
    expect(parseQuotaResult({ allowed: false, reason: 'weird' })).toBeNull()
  })
})

describe('rateLimitedMessage', () => {
  it('gives a distinct friendly message for each reason', () => {
    expect(rateLimitedMessage('daily_seconds')).toMatch(/today/i)
    expect(rateLimitedMessage('hourly_requests')).toMatch(/little while/i)
  })
})

describe('upstream status mapping', () => {
  it('maps Groq statuses to our error codes', () => {
    expect(mapUpstreamStatus(429)).toEqual({ error: 'rate_limited', httpStatus: 429 })
    expect(mapUpstreamStatus(413)).toEqual({ error: 'too_large', httpStatus: 413 })
    expect(mapUpstreamStatus(400)).toEqual({ error: 'unsupported_audio', httpStatus: 415 })
    expect(mapUpstreamStatus(401)).toEqual({ error: 'upstream_failed', httpStatus: 502 })
    expect(mapUpstreamStatus(503)).toEqual({ error: 'upstream_failed', httpStatus: 502 })
  })

  it('keeps the quota when the clip itself was the problem, releases it otherwise', () => {
    expect(shouldReleaseQuota(400)).toBe(false)
    expect(shouldReleaseQuota(413)).toBe(false)
    expect(shouldReleaseQuota(429)).toBe(true)
    expect(shouldReleaseQuota(500)).toBe(true)
  })
})
