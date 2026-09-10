/**
 * The custom drag-and-drop MIME type carrying a reflection card's catalog
 * `number` (see `data/reflectionCards.ts`) when it is dragged from the
 * home-screen reflection grid (`components/ReflectionSection.tsx`) onto an
 * activity's own segment on the timeline (`components/Timeline.tsx`) — the
 * "drag" path of reflection-card mapping (`state/boardReducer.ts`'s
 * `mapReflectionCard` action), independent of any prior selection.
 *
 * Deliberately its own MIME type, not `text/plain` — the tile-row's
 * activity-CARD drag (`TileRow.tsx`, dropped onto a grid slot) already uses
 * `text/plain` for the card NAME, and the two drags must never be mistaken
 * for each other: a reflection card dropped on a slot, or an activity card
 * dropped on an activity segment, should each cleanly no-op rather than be
 * misinterpreted as the other kind of drop.
 */
export const REFLECTION_CARD_MIME = 'application/x-reflection-card'
