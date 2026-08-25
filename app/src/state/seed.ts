import type { SlotEntries } from '@/domain/types'

/**
 * Initial in-memory board, ported from the prototype's `entries` object.
 *
 * There is no backend and no persistence in this pass, so this is seed content
 * rather than loaded data — it resets on reload, exactly as the prototype did.
 * When persistence lands this is the shape a fetch would return.
 */
export function createSeedEntries(): SlotEntries {
  const entries: SlotEntries = {}

  // 00:00 – 08:00 asleep.
  for (let slot = 0; slot < 16; slot += 1) {
    entries[slot] = {
      activities: [{ name: 'Night Sleep', path: [], duration: 30 }],
      flags: [],
    }
  }

  entries[16] = {
    activities: [{ name: 'Nature connect', path: ['Sunlight'], duration: 30 }],
    flags: [],
  }
  entries[17] = { activities: [{ name: 'Vipassana', path: [], duration: 30 }], flags: [] }
  entries[20] = { activities: [{ name: 'Vipassana', path: [], duration: 30 }], flags: [] }
  entries[22] = {
    activities: [{ name: 'Spiritual Care', path: ['Prayer'], duration: 30 }],
    flags: ['Trauma response'],
  }
  entries[24] = { activities: [{ name: 'Meal Prep', path: [], duration: 30 }], flags: [] }
  entries[27] = {
    activities: [{ name: 'Sports or Exercise', path: ['HIIT'], duration: 30 }],
    flags: [],
  }
  entries[29] = {
    activities: [
      { name: 'Body care', path: ['Oiling', 'Body'], duration: 15 },
      { name: 'Supplements', path: ['Magnesium'], duration: 15 },
    ],
    flags: ['Stress response'],
  }
  entries[30] = { activities: [{ name: 'Errand time', path: [], duration: 30 }], flags: [] }
  entries[31] = {
    activities: [{ name: 'Homework', path: [], duration: 30 }],
    flags: ['Fear response'],
  }

  return entries
}
