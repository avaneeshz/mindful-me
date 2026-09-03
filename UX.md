# UX — mindful-me

The interaction model as actually built. For the visual language, see `UI-DESIGN.md`; for the underlying data model, see `.claude/agents/full-stack-engineer.md`'s Target Architecture section.

## Core loop: schedule → edit → complete

**Two ways in, one engine.** Dragging an activity card onto the timeline and selecting a time slot then picking an activity both resolve through the same scheduling logic — a drop never auto-commits; it stages the same way a manual pick does, and both land in the same log-activity modal before anything is actually written. Nothing about "how you got here" changes what happens next.

**Picking an item: tile, then item, then (sometimes) sub-option — all without losing your place.** The 9 top-level categories render as one row of tiles; tapping one expands its items directly below, in place, never replacing the screen. Picking an item that has sub-options (a further drill-down, up to 3 levels for some items) opens the log-activity modal with a row of chips for that level shown *together with* the duration/quality/flag controls below it, not as a separate sequential step — narrowing the pick just narrows the chip row above, while everything else on screen stays put. A true leaf item (nothing further to choose) simply shows no chip row.

**Duration is one control, dragged or resized, not typed.** A mini time ruler sits in the modal, centered on the staged start, with a pill you drag to move it (duration held fixed) or resize from either edge. Two live time labels float above the track, each tracking its own edge as you drag, resize, or move it by keyboard — no separate "confirm the time" step. All three controls (the pill, and each resize handle) are real, independently focusable, keyboard-operable in 5-minute steps, and the pointer and keyboard paths dispatch the exact same underlying actions. The older `[−] [editable number] [+]` stepper (click-to-edit number, `+30min` / `+1hr` / `+2hr` quick-add buttons) still exists in the code as an off-by-default fallback for debugging/comparison — never shown at the same time as the drag control.

**A slot that's full says so, and offers a way out** — "This slot is full — remove one above or choose a different slot" — rather than silently rejecting a click.

**Duration that doesn't fit gets clamped, not split.** If you ask for 60 minutes starting somewhere with only 45 minutes free before the next activity, you're offered 45 with an explicit "capped at 45 — the next activity begins there" message. One logical activity is never invisibly split across two separate free periods; if you genuinely did something in two sittings, that's two separate scheduled activities.

**How did it feel, and any flag — both single-select, both optional, both live in the same modal.** Below the duration control sit two chip rows: quality (Nourishing / Productive / Straining / Draining / Dysregulated) and flag (Trauma response / Stress response / Fear response / Anger response, plus a real "None" chip — not an implicit empty state). Each is a pick-one-or-none on the *individual activity being logged*, not a whole-slot toggle; changing either later is a normal edit like any other field.

**Completion never disappears on edit.** Marking something done, then later adjusting its start time or duration, never silently un-completes it.

## Navigating time

**Today, by default; any day, on request.** The header's date pill shows today's date and opens a real month-grid picker on click — any past or future date is selectable, and the whole screen (timeline and editor alike) switches to that day. The "NOW" marker and badge only ever appear when you're actually looking at today; there's no ambiguity about whether a highlighted "now" means the real current moment.

**Editing the past is always allowed**, with no special mode or warning — you can go back and fix a forgotten entry on any day, and it saves against that day, not today.

## The sidebar

Collapsed by default on every device — desktop, tablet, and mobile alike. The hamburger control expands and collapses it identically everywhere; only the starting state changed from the product's earlier default.

## Sync

**The interface never waits on the network.** Every add, edit, or completion saves to the device instantly, whether or not a backend is even configured, and syncs to the server in the background. Stronger offline resilience (a durable write queue, multi-device conflict handling) is in progress but not yet merged — see `BACKLOG.md`.

## Accessibility & responsiveness baseline

Every interactive surface gets real semantic HTML, full keyboard navigation, accessible labels, and a visible focus state — not an afterthought pass. The app adapts information hierarchy and interaction across desktop, tablet, and mobile rather than simply scaling one layout down; every meaningful interaction accounts for loading, empty, error, success, disabled, hover, focus, and active states.
