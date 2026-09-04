# UI Design — mindful-me

The visual design system as actually built. See `CLAUDE.md` for the governing principles this implements; this file is the "here's what that looks like in practice" companion.

## Foundation

Tailwind CSS + shadcn/ui-style components + Radix UI primitives + Lucide icons + Motion for the small amount of purposeful animation the product actually uses. No other UI framework. Emoji are never used as primary interface icons.

## Typography

- **Display/headline**: Fraunces (serif) — greeting-scale text, headings, the selected slot's time header (`09:00–09:30`). The old duration stepper's number was also set in it, but that control is off by default now (see Duration below) — it only appears if the debug fallback is switched on.
- **Body/UI**: a sans body face throughout everything else.

## Color — a single monochrome theme, light and dark

A later, explicitly confirmed product round replaced every color system the app previously had (the warm-ivory/forest-green palette, the shared tile-blue accent, the per-category `deep`/`light` tokens, and all 53 per-item colors) with one flat, neutral pair — **no color anywhere.** Both themes are the same nine tokens, just inverted, declared once as CSS custom properties (`styles/index.css`) and reached everywhere through Tailwind theme colors (`tailwind.config.js`) — never a literal hex in a component:

| Token | Role | Dark (default) | Light |
|---|---|---|---|
| `bg` | Page background | `#0A0A0B` | `#FAFAF8` |
| `surface` | Cards, the modal, dropdowns | `#17171A` | `#FFFFFF` |
| `surface-2` | A step up from `surface` (rare) | `#1E1E21` | `#F1F0EC` |
| `ink` | Primary text/icons, borders-on-hover, the focus ring | `#F2F1EC` | `#17171A` |
| `ink-dim` | Secondary text/icons | `#8C8C90` | `#75757A` |
| `line` / `line-soft` | Hairline borders (14% / 8% opacity) | white-based | black-based |
| `inv-bg` / `inv-ink` | The theme's own invert pair — a selected chip, the primary button, the NOW badge | light-on-dark | dark-on-light |

Toggled instantly by the Sun/Moon icons beside the Day/Night timeline rows (`Timeline.tsx`) — not a separate settings screen — and persisted per-device via `localStorage` (`state/ThemeContext.tsx`, `lib/theme.ts`). Dark is the default on a first-ever load, matching the reference implementation this round was built against. Every component — sidebar, header, timeline, tiles, popups — follows the toggle; there is exactly one deliberate exception, described below.

**The old per-category/per-item color data (`Category.deep`/`.light`, `ActivityCard.color`/`.onColor`, the whole measured-WCAG-contrast catalog) still exists in `data/activities.ts`, unread by any component.** Kept rather than stripped from all 53 item literals, the same "kept but currently unused" treatment `onDeepBoost`/`.label-contrast-boost` already had before this round — if per-item color is ever reintroduced, the measured values don't need re-deriving. See that file's own color-system comment for the full context.

## The timeline surface

Two rows, Day and Night. **No illustrated scenery any more** — the gradient sky and layered silhouette illustration (`TimelineScenery.tsx`) a previous round built and this file used to document as a deliberate decorative exception was itself later, explicitly reversed; that component is deleted. The Day row is now a plain flat `surface` tone ("white only," in the product decision's own words). The Night row is a **fixed grey** (`--night-strip-fixed`, `#4B4B50`) — the one deliberate exception to the theme toggle: it stays that grey whether the app is in light or dark mode, along with its own companion tokens (`night-strip-fixed-ink`/`-line`) for anything drawn on it (the NOW marker, the midnight tick, a scheduled-activity segment), so those stay legible against that one fixed surface regardless of which theme the rest of the app is in.

The circular Sun/Moon end-cap for whichever period is currently active still visibly glows — unchanged this round, and a genuinely separate concern from the theme toggle (see Color above): the glow reflects real device time, the cap's own fill reflects which theme is currently selected, and the two are independent.

Every functional layer — the 48 slot buttons, activity segments, the NOW marker and badge, flags, hover/selected/drag-over outlines, the hour ticks — sits on top of that flat surface, monochrome throughout (Color, above).

The hour ruler beneath each row now shows **every hour**, not just start/midpoint/end — 13 labels per row (`6AM · 7 · 8 · 9 · 10 · 11 · 12 · 1 · 2 · 3 · 4 · 5 · 6PM` / the Night row's own 6PM-to-6AM set), with an AM/PM suffix only on the first and last label, bare numbers between. The labels live in their own row below the strip — never overlaid on it, so a scheduled-activity block can never cover one — each positioned at its real percentage-of-day rather than relying on even flexbox spacing, which only happened to look right for 3 same-width labels and stops working once labels have genuinely different widths ("6AM" vs "7").

## The tile row and log-activity modal

Selecting a slot no longer opens a flat 24-card grid or an always-visible side panel. The 9 category tiles fill their row edge-to-edge (`flex-1 min-w-0`, no horizontal scroll, no leftover space), each a plain `ink`-on-`bg` card with a flat progress bar along its bottom edge (fill width = done/total — replaces an earlier proportional water-fill gauge; the underlying done/total logic is unchanged, only the indicator). Tapping a tile grows a panel directly below it **in real layout flow** — a CSS `grid-template-rows` animation between `0fr` and `1fr` on a wrapper (`.panel-outer`, `styles/index.css`), never `position: absolute` — which is what makes the zero-overlap read structural rather than incidental: the container genuinely grows to contain the panel and pushes whatever follows it down. The panel **anchors to the tapped tile**: its own left edge for tiles 1-4, centered under tile 5, its own right edge for tiles 6-9 (`domain/panelGeometry.ts`, generalized off `tileCount`, not hardcoded to 9). Its **width is dynamic** — exactly enough for that category's own item count at their real card width and gap, plus padding, capped to the row's own width — so a 4-item category gets a visibly narrower panel than a 7-item one. A small chevron sits at the panel's top edge, at the tapped tile's own horizontal center (clamped inside the panel's bounds), and the whole panel scale-and-fades in from that same x position (`transform-origin`). Tapping the same tile again collapses it; tapping a different tile swaps the panel's content and re-anchors in place.

Picking an item opens `LogActivityModal.tsx` (`@radix-ui/react-dialog`): a full-screen sheet on mobile, a wide (760px, not tall) centered dialog from tablet up, named only by the activity itself — no tile-name subtitle underneath. A sub-option chip row (for an item that has one) and the duration/Activity quality/Chronic Symptoms/Protective response/Notes controls all render together, not as sequential steps. The duration ruler carries no "Duration" label above it any more — it shows directly (still named for assistive tech via a visually-hidden label) — and its pill carries no text either; two live time labels float above the track over the pill's own edges instead. Neighboring booked activities render as squared-off, flat `line-soft`-washed blocks (no per-item color any more) so a flush run of activities reads as one continuous strip. Below the three chip rows sits a plain, always-visible "Add notes" textarea — no expand/collapse, no separate heading, replacing an earlier inert stub. Save is a small centered pill, not a full-width bar; there is no separate Cancel button — the modal's own X close icon is the only way to dismiss without saving.

## Design principles in practice

Use: strong visual hierarchy, restrained color, consistent spacing and typography, semantic color tokens, accessible contrast, subtle borders and shadows, purposeful (not decorative) animation, responsive layouts.

Avoid: excessive gradients or glassmorphism, decorative shadow stacking, random one-off colors, unnecessary animation, inconsistent spacing, and one-off component designs that duplicate something the system already has. Before adding a new component: search the existing library first, extend what's there when it genuinely fits, and only build something new when the interaction pattern is genuinely new — never a second version of something that already exists.

## A visible exception, made deliberately

**The illustrated Day/Night scenery — reversed.** A previous round adopted it as this product's one deliberate decorative exception, after a live trial was reviewed and approved. A later, explicitly confirmed round removed it again in favor of the flat, monochrome surfaces described above — a genuine reversal, not a silent regression; it's recorded here so the history is traceable rather than looking like an oversight.

**The Night timeline strip's fixed grey is the current exception.** Every other surface in the product follows the light/dark theme toggle; the Night row alone stays the same grey (`--night-strip-fixed`) regardless of which theme is active — see "The timeline surface," above, for why. If this is ever revisited, it should be a deliberate call, not something that quietly drifts back to following the theme.
