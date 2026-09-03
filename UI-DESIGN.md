# UI Design — mindful-me

The visual design system as actually built. See `CLAUDE.md` for the governing principles this implements; this file is the "here's what that looks like in practice" companion.

## Foundation

Tailwind CSS + shadcn/ui-style components + Radix UI primitives + Lucide icons + Motion for the small amount of purposeful animation the product actually uses. No other UI framework. Emoji are never used as primary interface icons.

## Typography

- **Display/headline**: Fraunces (serif) — greeting-scale text, headings, the selected slot's time header (`09:00–09:30`). The old duration stepper's number was also set in it, but that control is off by default now (see Duration below) — it only appears if the debug fallback is switched on.
- **Body/UI**: a sans body face throughout everything else.

## Color

Restrained by design, not by accident. A neutral warm-paper background hosts flat, functional surfaces, layered with two independent, narrower-scoped color systems than the product used to have:

**One shared accent for the 9 category tiles.** The top-level tile row (`TileRow.tsx`) no longer colors each tile by its own category — all 9 tiles (Sleep & Rest, Food & Nourishment, Personal Care, Downtime & Errands, Movement & Body Therapy, Work & Projects, Nature & Spirit, Growth & Connection, Home & Chores) share one accent, a single blue (`--tile-accent`, mirrored into Tailwind as the `tile-accent` token — declared once, referenced everywhere it's needed, never re-typed as a literal). It colors the tile's icon/label, a real proportional water-fill gauge behind them (`height% = done/total` for that tile, with a wave-crest texture at the fill's top edge while partial), the active tile's ring, its panel-header icon circle, and the small connector chevron between an open tile and its panel.

**Each category still carries its own "deep"/"light" tokens** (`Category.deep`/`.light`, one pair per category, e.g. `--cat-sleep-deep`) — but their role is now much narrower than tile backgrounds. `deep` colors only the small 32px category icon chip next to each activity already logged in a slot's list (`CategoryIconChip.tsx`); `light` is a fallback fill used only when a scheduled activity's name no longer matches any current catalog entry (a stale/renamed taxonomy reference). `onDeep`/`onDeepBoost` (per-category foreground/contrast-boost pairing) remain on the `Category` type and populated in the data, but nothing currently reads them — dead weight kept for now rather than ripped out mid-taxonomy-change.

**53 individual item colors** — one flat color per catalog item (`ActivityCard.color`/`.onColor`), unrelated to and unaffected by the shared tile accent above. This is what actually paints a real thing on screen: an item chip inside an open tile's expand panel, a scheduled activity's segment on the timeline strip, and a neighboring booked activity inside the log-activity modal's duration ruler. Every `deep`/`color` foreground pairing across both systems was measured, not eyeballed — relative luminance → WCAG 2.1 contrast ratio against both white and charcoal, picking whichever clears more, nudging the fill's lightness (never its hue) where needed to clear the 4.5:1 AA text minimum, with `.label-contrast-boost` (a text-shadow mitigation) as the last resort if a nudge still can't get there. The current 9-tile/53-item catalog re-measured every fill against that same bar and every one cleared it with a lightness nudge alone — `.label-contrast-boost` is defined but currently unused, the documented fallback for the next color that doesn't nudge cleanly.

## The timeline surface

Two rows, Day and Night, each an illustrated scene — a gradient sky and layered silhouette scenery (mountains, a tree, birds by day; pines, mountains, stars by night) — hand-built in SVG/CSS rather than imported image assets, kept consistent with the rest of the app's all-code, zero-raster-asset construction. The circular Sun/Moon end-cap for whichever period is currently active visibly glows; the inactive one does not. Every functional layer — the 48 slot buttons, colored activity segments, the NOW marker and badge, flags, hover/selected/drag-over outlines, the hour ruler — sits legibly on top of that illustration; category-segment contrast against the busier background was explicitly checked and adjusted where it read poorly, not assumed to be fine by default.

The hour ruler beneath each row shows exactly three labels — start, midpoint, end (`6a · 12p · 6p` / `6p · 12a · 6a`) — in 12-hour lowercase format, not the seven 2-hour-interval labels an earlier version carried.

## The tile row and log-activity modal

Selecting a slot no longer opens a flat 24-card grid or an always-visible side panel. The 9 category tiles fill their row edge-to-edge (`flex-1 min-w-0`, no horizontal scroll, no leftover space) — tapping one expands a panel with that category's items directly below the row, in place, never replacing the screen; tapping the same tile again collapses it. Picking an item opens `LogActivityModal.tsx` (`@radix-ui/react-dialog`): a full-screen sheet on mobile, a wide (760px, not tall) centered dialog from tablet up. Inside it, a sub-option chip row (for an item that has one) and the duration/quality/flag controls render together, not as sequential steps. The duration control is a mini time ruler with a draggable/resizable pill — two live time labels float above the track over the pill's own edges rather than living inside it — and neighboring booked activities render as squared-off blocks in their own item colors so a flush run of activities reads as one continuous strip.

## Design principles in practice

Use: strong visual hierarchy, restrained color, consistent spacing and typography, semantic color tokens, accessible contrast, subtle borders and shadows, purposeful (not decorative) animation, responsive layouts.

Avoid: excessive gradients or glassmorphism, decorative shadow stacking, random one-off colors, unnecessary animation, inconsistent spacing, and one-off component designs that duplicate something the system already has. Before adding a new component: search the existing library first, extend what's there when it genuinely fits, and only build something new when the interaction pattern is genuinely new — never a second version of something that already exists.

## A visible exception, made deliberately

The illustrated Day/Night scenery is the one place this product spends real decorative budget — a departure from an otherwise flat, functional aesthetic, adopted only after a live trial was actually reviewed and approved rather than assumed to be the right call. It's called out here explicitly so it reads as a considered choice, not scope creep, if it's ever revisited.
