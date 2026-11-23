import { readStoredJSON, writeStoredJSON } from '@/lib/storage'

/**
 * Frames: four independent copies of a user's setup (header buttons, activity
 * and state tiles, notes, daily values, checklists). The timeline is shared by
 * all of them. The backend partitions rows by the `x-frame` request header
 * (see `supabase/migrations/20261127060000_four_frames.sql`); this module is
 * the one place the frontend knows which frame is on screen.
 *
 * The chosen frame is remembered on the device. Switching reloads the app, so
 * every in-memory list, context and in-flight request starts clean in the new
 * frame and nothing from the old one can leak across.
 */
export const FRAME_COUNT = 4
export const FRAME_HEADER = 'x-frame'

const STORAGE_KEY = 'mindful-me:frame'

export function isFrame(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= FRAME_COUNT
}

let current = ((): number => {
  const stored = readStoredJSON(STORAGE_KEY)
  return isFrame(stored) ? stored : 1
})()

/** The frame on screen, 1-based. */
export function getFrame(): number {
  return current
}

/**
 * Local-cache key for a frame-owned store. Frame 1 keeps the key it always had
 * (so existing caches stay valid and nothing needs migrating); frames 2-4 get
 * their own copy.
 */
export function frameKey(baseKey: string, frame: number = current): string {
  return frame === 1 ? baseKey : `${baseKey}:f${frame}`
}

/** Remembers `frame` as the one to open next. Returns false for anything outside 1-4. */
export function rememberFrame(frame: number): boolean {
  if (!isFrame(frame)) return false
  writeStoredJSON(STORAGE_KEY, frame)
  return true
}

/** Opens `frame`: remembers it and restarts the app in it. A no-op for the current or an invalid frame. */
export function switchFrame(frame: number): void {
  if (frame === current || !rememberFrame(frame)) return
  window.location.reload()
}

/** Test seam: forget the remembered frame and re-read it. */
export function resetFrameForTests(frame = 1): void {
  current = frame
}
