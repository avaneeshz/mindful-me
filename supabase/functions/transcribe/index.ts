import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceRoleClient, verifyUser } from '../_shared/supabaseClients.ts'
import {
  GROQ_TRANSCRIPTIONS_URL,
  MAX_REQUEST_BYTES,
  billableSeconds,
  checkAudio,
  mapUpstreamStatus,
  normalizeLanguage,
  parseQuotaResult,
  readBodyWithLimit,
  rateLimitedMessage,
  resolveModel,
  sanitizePrompt,
  shouldReleaseQuota,
} from '../_shared/transcription.ts'

/**
 * Voice dictation. POST multipart/form-data, Authorization: Bearer <the
 * signed-in user's access token>, fields:
 *   audio     the recorded clip (a File whose type is audio/*)
 *   seconds   optional, the clip length the client measured
 *   prompt    optional vocabulary hint (names, jargon), capped in length
 *   language  optional ISO 639-1 code; omit to auto-detect
 * → `{ text }` or `{ error, message? }`.
 *
 * The Groq key lives only in the `GROQ_API_KEY` secret on this project — it
 * never reaches the browser. `TRANSCRIBE_MODEL` optionally selects
 * `whisper-large-v3` instead of the default `whisper-large-v3-turbo`.
 *
 * Privacy: audio is forwarded and discarded; neither audio nor transcript is
 * stored or logged. Only a usage row (user, time, seconds) is kept, for the
 * per-user limits enforced in Postgres (`reserve_transcription_quota`).
 */
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  let userId: string
  try {
    userId = (await verifyUser(req)).id
  } catch {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'not_configured', message: 'Dictation is not set up on this project yet.' }, 500)
  }

  // Never buffer more than the cap, whatever the sender declares (or omits).
  const declared = Number(req.headers.get('content-length') ?? '0')
  const bytes = declared > MAX_REQUEST_BYTES ? null : await readBodyWithLimit(req.body, MAX_REQUEST_BYTES)
  if (!bytes) {
    return jsonResponse({ error: 'too_large', message: 'The recording is too long. Try a shorter clip.' }, 413)
  }

  let form: FormData
  try {
    form = await new Response(bytes, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData()
  } catch {
    return jsonResponse({ error: 'unsupported_audio', message: 'Send the clip as multipart form data.' }, 415)
  }
  const audio = form.get('audio')
  if (!(audio instanceof File)) {
    return jsonResponse({ error: 'unsupported_audio', message: 'No audio was sent.' }, 415)
  }

  const check = checkAudio(audio.type, audio.size)
  if (!check.ok) {
    return jsonResponse({ error: check.error, message: check.message }, check.error === 'too_large' ? 413 : 415)
  }

  // Limits are enforced in Postgres, atomically, before any upstream call.
  const admin = serviceRoleClient()
  const { data: quotaRaw, error: quotaError } = await admin.rpc('reserve_transcription_quota', {
    p_user_id: userId,
    p_seconds: billableSeconds(form.get('seconds'), audio.size),
  })
  const quota = quotaError ? null : parseQuotaResult(quotaRaw)
  if (!quota) return jsonResponse({ error: 'upstream_failed', message: 'Dictation is unavailable right now.' }, 502)
  if (!quota.allowed) {
    const res = jsonResponse(
      { error: 'rate_limited', message: rateLimitedMessage(quota.reason), reason: quota.reason, retryAfterSeconds: quota.retryAfterSeconds },
      429,
    )
    if (quota.retryAfterSeconds) res.headers.set('Retry-After', String(quota.retryAfterSeconds))
    return res
  }

  const release = () => admin.rpc('release_transcription_quota', { p_user_id: userId, p_usage_id: quota.usageId })

  const body = new FormData()
  body.append('file', audio, `dictation.${check.extension}`)
  body.append('model', resolveModel(Deno.env.get('TRANSCRIBE_MODEL')))
  body.append('response_format', 'json')
  body.append('temperature', '0')
  const prompt = sanitizePrompt(form.get('prompt'))
  if (prompt) body.append('prompt', prompt)
  const language = normalizeLanguage(form.get('language'))
  if (language) body.append('language', language)

  let upstream: Response
  try {
    upstream = await fetch(GROQ_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    })
  } catch {
    await release()
    return jsonResponse({ error: 'upstream_failed', message: 'Dictation is unavailable right now.' }, 502)
  }

  if (!upstream.ok) {
    if (shouldReleaseQuota(upstream.status)) await release()
    const { error, httpStatus } = mapUpstreamStatus(upstream.status)
    // Status only — never the response body, which could echo audio details.
    return jsonResponse({ error, upstreamStatus: upstream.status }, httpStatus)
  }

  let text = ''
  try {
    const json = (await upstream.json()) as { text?: unknown }
    text = typeof json.text === 'string' ? json.text.trim() : ''
  } catch {
    await release()
    return jsonResponse({ error: 'upstream_failed' }, 502)
  }
  return jsonResponse({ text })
})
