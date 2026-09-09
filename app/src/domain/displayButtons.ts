/**
 * "Display buttons" — header controls that always show a stored number on
 * their face (not just when opened) and take a single set/replace value per
 * day. Two today: Vipassana (minutes) and Steps (a plain integer). Pure
 * types + formatting only; persistence is `lib/displayValuesLocalStore.ts`.
 *
 * `input` is HOW the value is entered: `'number'` types the number straight
 * in; `'duration'` enters a start and end clock time (like the Sun / Moon
 * exposure log) and stores the minutes between them. The stored value and its
 * face format are the same either way — a `'min'` count.
 */

export const DISPLAY_BUTTONS = [
  { key: 'vipassana', label: 'Vipassana', unit: 'min', input: 'duration' },
  { key: 'steps', label: 'Steps', unit: 'int', input: 'number' },
] as const

export type DisplayButtonKey = (typeof DISPLAY_BUTTONS)[number]['key']
export type DisplayButtonUnit = (typeof DISPLAY_BUTTONS)[number]['unit']
export type DisplayButtonInput = (typeof DISPLAY_BUTTONS)[number]['input']

export function displayButtonUnit(key: DisplayButtonKey): DisplayButtonUnit {
  return DISPLAY_BUTTONS.find((button) => button.key === key)?.unit ?? 'int'
}

export function displayButtonInput(key: DisplayButtonKey): DisplayButtonInput {
  return DISPLAY_BUTTONS.find((button) => button.key === key)?.input ?? 'number'
}

/** `75` minutes → `"1h 15m"`, `40` → `"40m"`, `120` → `"2h"`. */
function formatMinutesValue(value: number): string {
  const h = Math.floor(value / 60)
  const m = value % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * A plain count, abbreviated once it passes 999: `1000` → `"1k"`, `1100` →
 * `"1.1k"`, `12300` → `"12.3k"`, `250000` → `"250k"`. Below 1000 it stays a
 * grouped integer (`"840"`).
 */
function formatCountValue(value: number): string {
  if (value < 1000) return value.toLocaleString()
  const thousands = Math.round(value / 100) / 10
  const text = Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)
  return `${text}k`
}

/**
 * The face value: an em dash when nothing has been logged for the viewed day,
 * a compact duration for `min` buttons, an abbreviated count for `int` buttons.
 */
export function formatDisplayValue(key: DisplayButtonKey, value: number | null): string {
  if (value === null) return '—'
  return displayButtonUnit(key) === 'min' ? formatMinutesValue(value) : formatCountValue(value)
}

/** Parses the editor input to a non-negative integer, or `null` for blank/invalid. */
export function parseDisplayValue(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
