/** The longest frame name, in characters — matches the `frame_names.name` check in the database. */
export const FRAME_NAME_MAX = 30

/** Names the user has given frames, by frame number. A frame with no entry uses its default name. */
export type FrameNames = Readonly<Partial<Record<number, string>>>

/**
 * What a typed name becomes: trimmed, inner whitespace collapsed, cut to the limit.
 * Empty (or only spaces) is `null`, meaning "back to the default name".
 */
export function normalizeFrameName(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed === '') return null
  return Array.from(collapsed).slice(0, FRAME_NAME_MAX).join('').trim()
}

export function defaultFrameName(frame: number): string {
  return `Frame ${frame}`
}

/** The name to show for `frame`: the user's own, or the default. */
export function frameDisplayName(frame: number, names: FrameNames): string {
  return names[frame] ?? defaultFrameName(frame)
}

/** Reads a stored or fetched value defensively: only frames 1-4 with a usable string survive. */
export function parseFrameNames(value: unknown): Record<number, string> {
  const out: Record<number, string> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const frame = Number(key)
    if (!Number.isInteger(frame) || frame < 1 || frame > 4 || typeof raw !== 'string') continue
    const name = normalizeFrameName(raw)
    if (name !== null) out[frame] = name
  }
  return out
}
