import type { FlagId, ScheduledActivity } from '@/domain/types'

const TIMEZONE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'

let seedId = 0
/** Deterministic ids for seed content — stable across renders/tests. */
function nextId(): string {
  seedId += 1
  return `seed-${seedId}`
}

function activity(
  name: string,
  path: string[],
  startMinutes: number,
  durationMinutes: number,
): ScheduledActivity {
  return {
    id: nextId(),
    name,
    path,
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    status: 'planned',
    timezone: TIMEZONE,
  }
}

/**
 * A whole-slot marker: no catalog activity, no duration, no schedule cost.
 * Legacy shape only — the client no longer creates these (Modal Redesign
 * §E), but the seed keeps demonstrating that OLD rows still render, exactly
 * like any pre-existing data would.
 */
function flagMarker(startMinutes: number, flags: FlagId[]): ScheduledActivity {
  return {
    id: nextId(),
    name: null,
    path: [],
    startMinutes,
    durationMinutes: 0,
    flags,
    quality: [],
    symptoms: [],
    notes: null,
    status: 'planned',
    timezone: TIMEZONE,
  }
}

/**
 * Initial in-memory board, ported from the prototype's `entries` object —
 * now as one row per logical activity with a real start time and duration,
 * rather than one row per occupied 30-minute slot. The one true multi-hour
 * activity this exposes cleanly that the old model could not: eight hours of
 * Night Sleep is now genuinely ONE activity (00:00, 480 minutes), not sixteen
 * separate 30-minute entries that merely happened to sit next to each other.
 *
 * There is no backend and no persistence in this pass, so this is seed
 * content rather than loaded data — it resets on reload, exactly as the
 * prototype did. When persistence lands (Phase 2) this is the shape a fetch
 * would return.
 */
export function createSeedActivities(): ScheduledActivity[] {
  seedId = 0
  return [
    activity('Night Sleep', [], 0, 8 * 60),
    // "Nature connect" -> "Sunlight" is now the standalone "Daily Sunlight"
    // item (Tile Redesign §3 — the old wrapper card is dissolved).
    activity('Daily Sunlight', [], 8 * 60, 30),
    activity('Vipassana', [], 8 * 60 + 30, 30),
    activity('Vipassana', [], 10 * 60, 30),
    activity('Spiritual Care', ['Prayer'], 11 * 60, 30),
    flagMarker(11 * 60, ['Trauma response']),
    activity('Meal Prep', [], 12 * 60, 30),
    activity('Sports or Exercise', ['HIIT'], 13 * 60 + 30, 30),
    // "Body care" renamed to "Body Care (self)"; sub/third path kept verbatim.
    activity('Body Care (self)', ['Oiling', 'Body'], 14 * 60 + 30, 15),
    // "Supplements"' sub-list now names the dosing window explicitly.
    activity('Supplements', ['Magnesium (post-dinner)'], 14 * 60 + 45, 15),
    flagMarker(14 * 60 + 30, ['Stress response']),
    activity('Errand time', [], 15 * 60, 30),
    activity('Homework', [], 15 * 60 + 30, 30),
    flagMarker(15 * 60 + 30, ['Fear response']),
  ]
}
