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
 * Seconds to charge against the user's daily cap: the larger of what the client
 * reports and a size-based floor, so a clip can't be billed as "1 second" to
 * dodge the cap. The floor assumes at least ~32 KB/s, far above any real
 * Opus/AAC recording (≈4–16 KB/s), so honest clips are never over-charged.
 */
export function billableSeconds(claimed: unknown, byteLength: number): number {
  const n = typeof claimed === 'string' ? Number(claimed) : typeof claimed === 'number' ? claimed : NaN
  const reported = Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0
  const floor = Math.ceil(byteLength / 32000)
  return Math.min(MAX_AUDIO_SECONDS, Math.max(1, reported, floor))
}

/**
 * Reads a request body but gives up (returns null) once it passes `maxBytes`,
 * whether or not the sender declared a Content-Length — so an oversized or
 * chunked upload is never buffered whole.
 */
export async function readBodyWithLimit(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
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
