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
  localDate: string,
  startMinutes: number,
  durationMinutes: number,
): ScheduledActivity {
  return {
    id: nextId(),
    name,
    path,
    localDate,
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
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
function flagMarker(localDate: string, startMinutes: number, flags: FlagId[]): ScheduledActivity {
  return {
    id: nextId(),
    name: null,
    path: [],
    localDate,
    startMinutes,
    durationMinutes: 0,
    flags,
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    status: 'planned',
    timezone: TIMEZONE,
  }
}

/**
 * Initial in-memory board for the window-day `windowDateISO` (its 06:00 →
 * next day 06:00). One row per logical activity with a real start time and
 * duration. Night Sleep is the demo of a genuine midnight-crossing activity:
 * ONE row starting 22:00 on the window day and running 8 hours straight
 * through the midnight tick to 06:00 — the thing the old midnight-anchored
 * model could not express.
 *
 * There is no persistence in local-only mode, so this resets on reload. When
 * a backend is configured (Phase 2) this is the shape a windowed fetch
 * returns; the small-hours rows would carry `localDate` = the next day.
 */
export function createSeedActivities(windowDateISO: string): ScheduledActivity[] {
  seedId = 0
  const d = windowDateISO
  return [
    // 22:00 -> 06:00 next morning, as ONE row (localDate = the window day it started on).
    activity('Night Sleep', [], d, 22 * 60, 8 * 60),
    activity('Daily Sunlight', [], d, 8 * 60, 30),
    activity('Vipassana', [], d, 8 * 60 + 30, 30),
    activity('Vipassana', [], d, 10 * 60, 30),
    activity('Spiritual Care', ['Prayer'], d, 11 * 60, 30),
    flagMarker(d, 11 * 60, ['Trauma Activation']),
    activity('Meal Prep', [], d, 12 * 60, 30),
    activity('Sports or Exercise', ['HIIT'], d, 13 * 60 + 30, 30),
    activity('Body Care (self)', ['Oiling', 'Body'], d, 14 * 60 + 30, 15),
    activity('Supplements', ['Magnesium (post-dinner)'], d, 14 * 60 + 45, 15),
    flagMarker(d, 14 * 60 + 30, ['Triggered']),
    activity('Errand time', [], d, 15 * 60, 30),
    activity('Homework', [], d, 15 * 60 + 30, 30),
    flagMarker(d, 15 * 60 + 30, ['Attack']),
  ]
}
