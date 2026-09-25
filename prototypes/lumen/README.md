# Lumen — prototype

A standalone, from-scratch prototype of a calm, dark, time-tracking home screen. It has its own design system and doesn't share code, components, data or categories with the main mindful-me app in `app/`.

```bash
cd prototypes/lumen
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

All data is sample data held in memory. Reloading resets it.

## What's here

- **Today**: brand header, date picker with a month popover, export menu (a real CSV download), a Health-sync toggle, and Customize (show or hide metrics and categories).
  - Metric tiles (steps, water, protein) open a stepper sheet. A tile turns mint when its goal is met.
  - Wake-up and wind-down tracks: drag, click or use the arrow keys, snapping to 15 minutes.
  - Slot card: the current 30-minute slot, how much of it is used, and a 48-slot scrubber whose bars fill in each category's colour. It also has the slot's entries (removable) and a 3×3 category grid. Picking a category opens an activity sheet where you choose the activity and duration and log it; a toast offers Undo.
  - "Where today went": how the day split across categories, plus a timeline you can expand. Tapping a row jumps to that slot.
- **Calendar**: a month heatmap and a summary of the selected day.
- **Insights**: a stacked chart of time per day (week or 4 weeks) and a category breakdown you can filter.
- **More**: settings.
- **Quick log**: the "+" button, the sidebar button, or the `L` key.

## Layout

| Width | Navigation | Today layout |
|---|---|---|
| < 768 px | Bottom bar with a raised "+" button | Single column |
| 768–1279 px | Icon rail | Single column below 1024 px, two columns above |
| ≥ 1280 px | Full sidebar | Two columns; the slot card stays pinned |

Sheets slide up from the bottom on phones and open as a centered dialog from tablet width up.

## Design system

- Tokens (surfaces, text colours, accents, category hues) are CSS variables in `src/index.css`. They're mapped into Tailwind in `tailwind.config.js`.
- Radius scale: control 12, tile 18, card 22, panel 28, pill fully rounded.
- Fonts: Fraunces for display headings, Inter for the interface.
- Shared primitives live in `src/components/ui/`: Button, Sheet, Popover, MenuItem, IconBubble, ProgressBar, ProgressRing, Segmented, Switch, EmptyState, Toaster.
- Motion runs 150–300 ms and respects `prefers-reduced-motion`.
