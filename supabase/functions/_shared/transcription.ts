/**
 * Pure request-validation and response-mapping rules for the `transcribe`
 * edge function. No Deno APIs, no network — so they run under Vitest like the
 * other `_shared` modules.
 *
 * Privacy: nothing here logs, stores or returns audio; the transcript text is
 * only ever passed straight back to the caller.
 */

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024
/** A whole multipart request may be a little bigger than the audio part. */
export const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 64 * 1024
export const MAX_AUDIO_SECONDS = 180
export const MAX_PROMPT_CHARS = 400

export const DEFAULT_MODEL = 'whisper-large-v3-turbo'
export const ALLOWED_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'] as const
export const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

export type TranscribeErrorCode =
  | 'unauthorized'
  | 'not_configured'
  | 'rate_limited'
  | 'too_large'
  | 'unsupported_audio'
  | 'upstream_failed'

/** Extensions Groq accepts, keyed by the MIME subtype the browser records. */
const EXTENSION_BY_SUBTYPE: Record<string, string> = {
  webm: 'webm',
  mp4: 'mp4',
  'x-m4a': 'm4a',
  m4a: 'm4a',
  aac: 'm4a',
  ogg: 'ogg',
  opus: 'ogg',
  wav: 'wav',
  'x-wav': 'wav',
  wave: 'wav',
  mpeg: 'mp3',
  mp3: 'mp3',
  flac: 'flac',
  'x-flac': 'flac',
}

/** Returns the file extension for an `audio/*` MIME type, or null if unsupported. */
export function audioExtension(mimeType: string | null | undefined): string | null {
  const match = /^audio\/([a-z0-9.+-]+)\s*(;.*)?$/i.exec((mimeType ?? '').trim())
  if (!match) return null
  return EXTENSION_BY_SUBTYPE[match[1].toLowerCase()] ?? null
}

export type AudioCheck =
  | { ok: true; extension: string }
  | { ok: false; error: 'unsupported_audio' | 'too_large'; message: string }

export function checkAudio(mimeType: string | null | undefined, byteLength: number): AudioCheck {
  const extension = audioExtension(mimeType)
  if (!extension) {
    return { ok: false, error: 'unsupported_audio', message: 'That audio format is not supported.' }
  }
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    return { ok: false, error: 'unsupported_audio', message: 'The recording was empty.' }
  }
  if (byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, error: 'too_large', message: 'The recording is too long. Try a shorter clip.' }
  }
  return { ok: true, extension }
}

/**
 * Seconds to charge against the user's daily cap. The client reports the clip
 * length; we clamp it, and fall back to a size-based estimate when it is
 * missing or nonsense. (Underreporting only helps a user past the daily cap —
 * the hourly request cap still holds, and the 10 MB size cap bounds each clip.)
 */
export function billableSeconds(claimed: unknown, byteLength: number): number {
  const n = typeof claimed === 'string' ? Number(claimed) : typeof claimed === 'number' ? claimed : NaN
  if (Number.isFinite(n) && n > 0) return Math.min(MAX_AUDIO_SECONDS, Math.max(1, Math.ceil(n)))
  // ~16 KB/s is a generous mid-point between Opus (≈4 KB/s) and AAC (≈8–16 KB/s).
  return Math.min(MAX_AUDIO_SECONDS, Math.max(1, Math.ceil(byteLength / 16000)))
}

/** Vocabulary hint for Whisper: trimmed, whitespace-collapsed, length-capped. */
export function sanitizePrompt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT_CHARS).trim()
  return text.length > 0 ? text : null
}

/** ISO 639-1 language code ("en", "hi") or null for auto-detect. */
export function normalizeLanguage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase()
  return /^[a-z]{2}$/.test(code) ? code : null
}

/** Picks the configured model; anything not on the allow-list falls back to the default. */
export function resolveModel(configured: string | null | undefined): string {
  const value = (configured ?? '').trim()
  return (ALLOWED_MODELS as readonly string[]).includes(value) ? value : DEFAULT_MODEL
}

export interface QuotaResult {
  allowed: boolean
  usageId?: string
  reason?: 'hourly_requests' | 'daily_seconds'
  retryAfterSeconds?: number
}

/** Normalizes the jsonb the `reserve_transcription_quota` RPC returns. */
export function parseQuotaResult(raw: unknown): QuotaResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.allowed === true && typeof r.usage_id === 'string') return { allowed: true, usageId: r.usage_id }
  if (r.allowed === false && (r.reason === 'hourly_requests' || r.reason === 'daily_seconds')) {
    return {
      allowed: false,
      reason: r.reason,
      retryAfterSeconds: typeof r.retry_after_seconds === 'number' ? r.retry_after_seconds : undefined,
    }
  }
  return null
}

export function rateLimitedMessage(reason: QuotaResult['reason']): string {
  return reason === 'daily_seconds'
    ? "You've reached today's dictation limit. You can still type, and dictation resets within 24 hours."
    : "You're dictating a lot — try again in a little while."
}

/** Maps a non-OK upstream (Groq) status to our error vocabulary and HTTP status. */
export function mapUpstreamStatus(status: number): { error: TranscribeErrorCode; httpStatus: number } {
  if (status === 429) return { error: 'rate_limited', httpStatus: 429 }
  if (status === 413) return { error: 'too_large', httpStatus: 413 }
  if (status === 400 || status === 415 || status === 422) return { error: 'unsupported_audio', httpStatus: 415 }
  return { error: 'upstream_failed', httpStatus: 502 }
}

/** Whether an upstream failure should hand the user's reserved quota back. */
export function shouldReleaseQuota(status: number): boolean {
  return status !== 400 && status !== 413 && status !== 415 && status !== 422
}
