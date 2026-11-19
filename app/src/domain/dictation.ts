/**
 * Pure rules for voice dictation: where spoken text goes in a field, how long
 * a clip may be, and what each failure says to the person. No React, no DOM,
 * no storage — it runs unchanged in a future native app.
 */

/** Longest single recording; the recorder stops itself here. */
export const MAX_DICTATION_MS = 120_000

export type DictationStatus = 'idle' | 'recording' | 'transcribing' | 'error'

/** Every way dictation can fail, from the recorder, the network or the server. */
export type DictationErrorCode =
  | 'permission_denied'
  | 'no_microphone'
  | 'unsupported'
  | 'recording_failed'
  | 'empty'
  | 'offline'
  | 'unavailable'
  | 'unauthorized'
  | 'not_configured'
  | 'rate_limited'
  | 'too_large'
  | 'unsupported_audio'
  | 'upstream_failed'

const ERROR_MESSAGES: Record<DictationErrorCode, string> = {
  permission_denied:
    'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.',
  no_microphone: 'No microphone was found. Connect one and try again.',
  unsupported: "Dictation isn't supported in this browser.",
  recording_failed: "Couldn't record. Please try again.",
  empty: "Didn't catch anything. Try speaking a little closer to the microphone.",
  offline: "You're offline. Dictation needs a connection — you can still type.",
  unavailable: 'Dictation is unavailable right now. Please try again.',
  unauthorized: 'Sign in again to use dictation.',
  not_configured: "Dictation isn't set up yet.",
  rate_limited: "You're dictating a lot — try again in a little while.",
  too_large: 'That recording is too long. Try a shorter clip.',
  unsupported_audio: "That recording couldn't be read. Please try again.",
  upstream_failed: 'Dictation is unavailable right now. Please try again.',
}

export function dictationErrorMessage(code: DictationErrorCode): string {
  return ERROR_MESSAGES[code]
}

/** "0:07", "1:05" — the elapsed-time label while recording. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export interface InsertResult {
  /** The field's whole new value. */
  value: string
  /** Where the caret belongs afterwards (just after the inserted text). */
  caret: number
  /** Exactly what was inserted, including any added leading/trailing space. */
  inserted: string
}

const OPENS_WORD = /[\s([{"'“‘]$/
const CLOSES_WORD = /^[\s.,;:!?)\]}"'”’]/

/**
 * Inserts spoken `text` into `value`, replacing the selection
 * `[selectionStart, selectionEnd)`. A space is added before the text when the
 * character to its left is a word character, and after it when the character
 * to its right is a word character, so dictating mid-sentence never glues
 * words together. Out-of-range or reversed selections are clamped, and a
 * `null` selection (an unfocused field) appends at the end.
 */
export function insertAtSelection(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  text: string,
): InsertResult {
  const spoken = text.trim()
  if (!spoken) return { value, caret: clampCaret(selectionEnd ?? value.length, value), inserted: '' }

  const a = clampCaret(selectionStart ?? value.length, value)
  const b = clampCaret(selectionEnd ?? selectionStart ?? value.length, value)
  const start = Math.min(a, b)
  const end = Math.max(a, b)

  const before = value.slice(0, start)
  const after = value.slice(end)
  const lead = before.length > 0 && !OPENS_WORD.test(before) ? ' ' : ''
  const trail = after.length > 0 && !CLOSES_WORD.test(after) ? ' ' : ''
  const inserted = `${lead}${spoken}${trail}`
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length, inserted }
}

function clampCaret(n: number, value: string): number {
  if (!Number.isFinite(n)) return value.length
  return Math.min(Math.max(0, Math.trunc(n)), value.length)
}

/** A person's own dictation choices, kept on the device. */
export interface DictationPrefs {
  /** Show mic buttons at all. */
  enabled: boolean
  /** They have read the one-time "audio goes to a speech service" notice. */
  disclosed: boolean
}

export const DEFAULT_DICTATION_PREFS: DictationPrefs = { enabled: true, disclosed: false }

/** Reads stored prefs defensively: anything unexpected falls back field by field. */
export function parseDictationPrefs(raw: unknown): DictationPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_DICTATION_PREFS
  const r = raw as Record<string, unknown>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_DICTATION_PREFS.enabled,
    disclosed: typeof r.disclosed === 'boolean' ? r.disclosed : DEFAULT_DICTATION_PREFS.disclosed,
  }
}

/** The one-time notice shown before the first recording is sent anywhere. */
export const DICTATION_DISCLOSURE = {
  title: 'Type with your voice?',
  description:
    'Dictation sends your recording to Groq, a speech-to-text service, to turn it into text. The recording is not stored by mindful-me or kept after it is transcribed. You can turn dictation off any time in Settings.',
  confirmLabel: 'Allow and start',
} as const
