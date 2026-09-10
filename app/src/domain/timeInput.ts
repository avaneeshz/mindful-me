/**
 * Keyboard-first clock-time entry — the pure core shared by every "type a
 * time" field in the app (Sun / Moon exposure, Vipassana duration). No React,
 * no DOM: parsing loose digits into a 12-hour clock time, converting to and
 * from the `HH:MM` 24-hour string the rest of the domain speaks
 * (`domain/sunMoonLog.ts`), and picking the AM/PM a fresh field should start
 * on. Mirrors how `domain/notes.ts` keeps header-pill logic component-free.
 */

export type Meridiem = 'AM' | 'PM'

/** The wall-clock meridiem right now — what an empty time field defaults to. */
export function currentMeridiem(now: Date = new Date()): Meridiem {
  return now.getHours() < 12 ? 'AM' : 'PM'
}

/**
 * Read loose keyboard input as a 12-hour clock time. Accepts `"2"`, `"230"`,
 * `"2:30"`, `"1215"`, `"12:15"` — digits with an optional single colon. When
 * there is no colon, the last two digits are minutes and the rest is the
 * hour (`"230"` → 2:30, `"9"` → 9:00). Returns `null` for anything that is
 * not a real time on a 1–12 / 0–59 clock.
 */
export function parseClockText(raw: string): { h12: number; minute: number } | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  let hourPart: string
  let minutePart: string

  if (trimmed.includes(':')) {
    const segments = trimmed.split(':')
    if (segments.length !== 2) return null
    hourPart = segments[0]
    minutePart = segments[1] === '' ? '0' : segments[1]
  } else {
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length === 0 || digits.length > 4 || digits.length !== trimmed.length) return null
    if (digits.length <= 2) {
      hourPart = digits
      minutePart = '0'
    } else {
      hourPart = digits.slice(0, digits.length - 2)
      minutePart = digits.slice(-2)
    }
  }

  if (!/^\d{1,2}$/.test(hourPart) || !/^\d{1,2}$/.test(minutePart)) return null
  const h12 = Number(hourPart)
  const minute = Number(minutePart)
  if (h12 < 1 || h12 > 12) return null
  if (minute < 0 || minute > 59) return null
  return { h12, minute }
}

/** 12-hour clock time + meridiem → `"HH:MM"` on a 24-hour clock. */
export function to24Hour(h12: number, minute: number, meridiem: Meridiem): string {
  const base = h12 % 12
  const hour = meridiem === 'PM' ? base + 12 : base
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** `"HH:MM"` 24-hour string → its 12-hour parts, or `null` if malformed. */
export function from24Hour(hhmm: string): { h12: number; minute: number; meridiem: Meridiem } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return {
    h12: hour % 12 === 0 ? 12 : hour % 12,
    minute,
    meridiem: hour < 12 ? 'AM' : 'PM',
  }
}

/** Canonical text for the editable part of the field (no meridiem): `"2:05"`. */
export function formatClockText(h12: number, minute: number): string {
  return `${h12}:${String(minute).padStart(2, '0')}`
}
