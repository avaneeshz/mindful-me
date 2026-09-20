import { supabase } from '@/lib/supabaseClient'
import type { SupplementCompletion, SupplementItemKey } from '@/domain/supplements'

interface SupplementCompletionDto {
  item_key: string
  local_date: string
  done: boolean
  note: string | null
  completed_at: string | null
  updated_at: string
}

function dtoToClient(dto: SupplementCompletionDto): SupplementCompletion {
  return {
    itemKey: dto.item_key as SupplementItemKey,
    localDate: dto.local_date,
    done: dto.done,
    note: dto.note ?? '',
    completedAt: dto.completed_at,
  }
}

/**
 * One calendar day's checklist — only the items actually touched that day
 * (untouched items simply have no row; `domain/supplements.ts`'s
 * `fullDayChecklist` fills those in as unchecked). Rule 8: always scoped to
 * one day. Returns `null` (never `[]`) on any failure to reach/read the
 * server, so a caller can tell "genuinely nothing touched today" from
 * "couldn't check" and knows not to overwrite local state in the latter
 * case — mirrors `apiListNoteEntries`.
 */
export async function apiListSupplementCompletions(
  headerButtonId: string,
  localDate: string,
): Promise<SupplementCompletion[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('list_supplement_completions', {
    p_header_button_id: headerButtonId,
    p_local_date: localDate,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[supplements] list_supplement_completions failed — staying on local data', error.message)
    return null
  }
  return ((data ?? []) as SupplementCompletionDto[]).map(dtoToClient)
}

/**
 * Sets one item's done/note state for one day — a whole-entry upsert (done
 * + note together), same "caller sends the authoritative full value"
 * contract every bundled field in this project already follows. Returns
 * `null` on failure to reach/read the server rather than throwing — the
 * caller already holds the local-first copy (rule 6).
 */
export async function apiSetSupplementCompletion(
  headerButtonId: string,
  itemKey: SupplementItemKey,
  localDate: string,
  done: boolean,
  note: string,
): Promise<SupplementCompletion | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('set_supplement_completion', {
    p_header_button_id: headerButtonId,
    p_item_key: itemKey,
    p_local_date: localDate,
    p_done: done,
    p_note: note.trim() ? note : null,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[supplements] set_supplement_completion failed — kept locally, will retry on next load', error.message)
    return null
  }
  return dtoToClient(data as SupplementCompletionDto)
}
