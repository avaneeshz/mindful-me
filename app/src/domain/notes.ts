/**
 * SCRUM-13 — the 6 header pills (Gifts, Chits, Opportunities, Learnings,
 * Mirror, Prayer) each open a note-entry surface: write a note, Store it
 * with the current timestamp, see the full history for that button. This
 * module is the pure, DB/React-free heart of that feature — types, the
 * fixed enumerations, and validation — mirroring how `domain/scheduling.ts`
 * keeps the shared scheduling logic out of any one component or API call
 * site. No React, no Supabase, no `localStorage` — see
 * `state/useNoteEntries.ts` for where those live.
 */

/** The 6 header pills this ticket wires up, in the order they render. */
export const NOTE_BUTTONS = [
  { key: 'gifts', label: 'Gifts' },
  { key: 'chits', label: 'Chits' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'learnings', label: 'Learnings' },
  { key: 'mirror', label: 'Mirror' },
  { key: 'prayer', label: 'Prayer' },
] as const

export type NoteButtonKey = (typeof NOTE_BUTTONS)[number]['key']

/** Gifts-only dropdown — see the ticket's acceptance criteria verbatim. */
export const GIFT_TYPES = ['Dreamer', 'The Voice', 'The Knower', 'Memory Bank', 'Amplifier'] as const

export type GiftType = (typeof GIFT_TYPES)[number]

/** One stored note, as the client sees it (server-decrypted, DB-shaped timestamp already an ISO string). */
export interface NoteEntry {
  id: string
  buttonKey: NoteButtonKey
  note: string
  /** Only ever non-null when `buttonKey === 'gifts'` (DB constraint `gift_type_only_for_gifts`). */
  giftType: GiftType | null
  createdAt: string
}

export function noteButtonLabel(key: NoteButtonKey): string {
  return NOTE_BUTTONS.find((button) => button.key === key)?.label ?? key
}

/** Only Gifts carries the gift-type dropdown (read the acceptance criteria carefully — see ticket). */
export function requiresGiftType(buttonKey: NoteButtonKey): boolean {
  return buttonKey === 'gifts'
}

/**
 * Whether the Store/Save button should be enabled: a real, non-blank note,
 * and — for Gifts only — a gift type actually chosen. Shared by the
 * component (to disable the button) and would-be callers of the API layer,
 * so "what counts as submittable" lives in exactly one place, the same
 * reasoning `domain/scheduling.ts`'s `validateSchedule` follows.
 */
export function canSubmitNote(buttonKey: NoteButtonKey, note: string, giftType: GiftType | null): boolean {
  if (note.trim() === '') return false
  if (requiresGiftType(buttonKey) && giftType === null) return false
  return true
}

/** `Tue, 5 Sep · 3:45 PM`-shaped, device-local — no timezone library needed (mirrors `HeaderBar`'s own date formatting). */
export function formatNoteTimestamp(date: Date): string {
  const datePart = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart} · ${timePart}`
}
