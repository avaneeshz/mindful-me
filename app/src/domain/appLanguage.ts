/**
 * The product's shared vocabulary — the names product, engineering and users
 * all use for each part of the Today screen. Edit-mode section labels read
 * from here, and `APP-LANGUAGE.md` documents the same list. Change a name in
 * both places together.
 */

export type AppSectionId = 'nonNegotiableButtons' | 'timeline' | 'slotDetails' | 'tileActivities' | 'stateTiles'

export interface AppSection {
  id: AppSectionId
  /** The name shown to users and used in code reviews, docs and support. */
  name: string
  /** The one line shown under the name in Edit mode. */
  description: string
}

export const APP_SECTIONS: Record<AppSectionId, AppSection> = {
  nonNegotiableButtons: {
    id: 'nonNegotiableButtons',
    name: 'Non-Negotiable Buttons',
    description: 'Daily notes, quick logs and checklists. Drag one to reorder it within its group.',
  },
  timeline: {
    id: 'timeline',
    name: 'Timeline',
    description: 'Your day and night in 30-minute slots. Sun and Moon show time logged in each light.',
  },
  slotDetails: {
    id: 'slotDetails',
    name: 'Slot Details',
    description: 'The selected slot: its time, how full it is and what is logged in it.',
  },
  tileActivities: {
    id: 'tileActivities',
    name: 'Tile/Activities',
    description: 'Your tiles and the activities inside them. Tap one to rename it, change its icon or delete it.',
  },
  stateTiles: {
    id: 'stateTiles',
    name: 'State Tiles',
    description: 'Cards for how you felt. Pick an activity on the Timeline, then tap a card to map it.',
  },
}

/** Name for user-facing copy, e.g. `sectionName('stateTiles')` → `"State Tiles"`. */
export function sectionName(id: AppSectionId): string {
  return APP_SECTIONS[id].name
}
