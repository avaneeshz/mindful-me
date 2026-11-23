import { supabase } from '@/lib/supabaseClient'
import { parseFrameNames } from '@/domain/frameNames'

/**
 * The user's frame names (`public.frame_names`, see `20261128060000_frame_names.sql`).
 * `null` — never `{}` — when the server couldn't be read, so the caller keeps its own copy.
 */
export async function apiListFrameNames(): Promise<Record<number, string> | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('frame_names').select('frame, name')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[frameNames] list failed — staying on local data', error.message)
    return null
  }
  const byFrame: Record<string, unknown> = {}
  for (const row of (data ?? []) as { frame: number; name: string | null }[]) byFrame[String(row.frame)] = row.name
  return parseFrameNames(byFrame)
}

/** Saves (or, with `null`, clears) one frame's name. `false` when the write didn't land — the local copy stands. */
export async function apiSetFrameName(frame: number, name: string | null): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('frame_names')
    .upsert({ frame, name, updated_at: new Date().toISOString() }, { onConflict: 'user_id,frame' })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[frameNames] save failed — kept on this device', error.message)
    return false
  }
  return true
}
