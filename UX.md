# UX — mindful-me

The interaction model as actually built. For the visual language, see `UI-DESIGN.md`; for the underlying data model, see `.claude/agents/full-stack-engineer.md`'s Target Architecture section.

## Core loop: schedule → edit → complete

**Two ways in, one engine.** Dragging an activity card onto the timeline and selecting a time slot then picking an activity both resolve through the same scheduling logic — a drop never auto-commits; it stages the same way a manual pick does, and both land in one duration-confirmation panel before anything is actually written. Nothing about "how you got here" changes what happens next.

**Duration is one control, not two.** A single row — `[−]` a live number `[+]` — sits centered under the activity picker. The number itself is click-to-edit: type an exact value (37 minutes, if that's genuinely what it was) and it commits exactly as typed, through the same validation as the stepper buttons. `+30min` / `+1hr` / `+2hr` buttons add to whatever's currently set, for the common case of "just make it longer." The stepper's own ±5 buttons always land on a clean multiple of 5 — it can never drift to an off-grid number no matter how many times you click.

**A slot that's full says so, and offers a way out** — "This slot is full — remove one above or choose a different slot" — rather than silently rejecting a click.

**Duration that doesn't fit gets clamped, not split.** If you ask for 60 minutes starting somewhere with only 45 minutes free before the next activity, you're offered 45 with an explicit "capped at 45 — the next activity begins there" message. One logical activity is never invisibly split across two separate free periods; if you genuinely did something in two sittings, that's two separate scheduled activities.

**Completion never disappears on edit.** Marking something done, then later adjusting its start time or duration, never silently un-completes it.

## Navigating time

**Today, by default; any day, on request.** The header's date pill shows today's date and opens a real month-grid picker on click — any past or future date is selectable, and the whole screen (timeline and editor alike) switches to that day. The "NOW" marker and badge only ever appear when you're actually looking at today; there's no ambiguity about whether a highlighted "now" means the real current moment.

**Editing the past is always allowed**, with no special mode or warning — you can go back and fix a forgotten entry on any day, and it saves against that day, not today.

## The sidebar

Collapsed by default on every device — desktop, tablet, and mobile alike. The hamburger control expands and collapses it identically everywhere; only the starting state changed from the product's earlier default.

## Sync & offline

**The interface never waits on the network.** Every add, edit, or completion saves to the device instantly, whether or not a backend is even configured, and whether or not the device is actually online. A background sync-status indicator in the header stays silent when everything's healthy, and only speaks up when there's something to say: offline, syncing, unable to sync (with a real retry action), or "updated from another device" when a conflict resolved somewhere else.

**A conflict never loses your work outright.** If two devices edit the same activity, the newer edit wins on the board — but the one that lost is never discarded; it's preserved and remains recoverable, even though there's currently no dedicated screen for browsing lost edits directly (see `ROADMAP.md`).

## Insights

Reached from the sidebar's "Insights" item. A Day/Week toggle plus the same date picker used on the timeline; four sections — category time totals, completion (of what was planned, how much got done), free-vs-occupied time for the visible window, and a 14-day/8-week trend with per-category filter chips. Loads instantly from local data, then quietly reconciles with the server in the background, exactly like the timeline. An empty day shows a plain, honest empty state rather than a chart full of zeros.

## Accessibility & responsiveness baseline

Every interactive surface gets real semantic HTML, full keyboard navigation, accessible labels, and a visible focus state — not an afterthought pass. The app adapts information hierarchy and interaction across desktop, tablet, and mobile rather than simply scaling one layout down; every meaningful interaction accounts for loading, empty, error, success, disabled, hover, focus, and active states.
