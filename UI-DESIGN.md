# UI Design — mindful-me

The visual design system as actually built. See `CLAUDE.md` for the governing principles this implements; this file is the "here's what that looks like in practice" companion.

## Foundation

Tailwind CSS + shadcn/ui-style components + Radix UI primitives + Lucide icons + Motion for the small amount of purposeful animation the product actually uses. No other UI framework. Emoji are never used as primary interface icons.

## Typography

- **Display/headline**: Fraunces (serif) — greeting-scale text, headings, the duration stepper's number.
- **Body/UI**: a sans body face throughout everything else.

## Color

Restrained by design, not by accident. A neutral warm-paper background hosts flat, functional surfaces; five category tokens (Mind & Rest, Body & Domestic, Sports or Exercise, Nature & Connection, Focus & Growth) each carry a "deep" tone (tile backgrounds, icon chips, legend fills) and a "light" tone (timeline segment fills only — deliberately softer than card art, so the strip itself reads as calm background, not another layer of saturated color).

## The timeline surface

Two rows, Day and Night, each an illustrated scene — a gradient sky and layered silhouette scenery (mountains, a tree, birds by day; pines, mountains, stars by night) — hand-built in SVG/CSS rather than imported image assets, kept consistent with the rest of the app's all-code, zero-raster-asset construction. The circular Sun/Moon end-cap for whichever period is currently active visibly glows; the inactive one does not. Every functional layer — the 48 slot buttons, colored activity segments, the NOW marker and badge, flags, hover/selected/drag-over outlines, the hour ruler — sits legibly on top of that illustration; category-segment contrast against the busier background was explicitly checked and adjusted where it read poorly, not assumed to be fine by default.

The hour ruler beneath each row shows exactly three labels — start, midpoint, end (`6a · 12p · 6p` / `6p · 12a · 6a`) — in 12-hour lowercase format, not the seven 2-hour-interval labels an earlier version carried.

## Design principles in practice

Use: strong visual hierarchy, restrained color, consistent spacing and typography, semantic color tokens, accessible contrast, subtle borders and shadows, purposeful (not decorative) animation, responsive layouts.

Avoid: excessive gradients or glassmorphism, decorative shadow stacking, random one-off colors, unnecessary animation, inconsistent spacing, and one-off component designs that duplicate something the system already has. Before adding a new component: search the existing library first, extend what's there when it genuinely fits, and only build something new when the interaction pattern is genuinely new — never a second version of something that already exists.

## A visible exception, made deliberately

The illustrated Day/Night scenery is the one place this product spends real decorative budget — a departure from an otherwise flat, functional aesthetic, adopted only after a live trial was actually reviewed and approved rather than assumed to be the right call. It's called out here explicitly so it reads as a considered choice, not scope creep, if it's ever revisited.
