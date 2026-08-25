---
name: dnd-source-grid-capacity-coupling
description: The activity-tile drag source grid only exists in the DOM when the currently-selected slot has room — dragging a card onto a DIFFERENT, empty slot is impossible whenever the last-selected slot is full.
metadata:
  type: project
---

`ActivityPicker.tsx`'s 24-tile grid (the only place `draggable` activity
cards render) is conditionally unmounted whenever `atCapacity` is true for
`state.selectedSlot` — replaced entirely by a "This slot is full" message
(`!atCapacity && <div className="picker-grid">...`). This is correct for the
click-to-select flow (the grid you'd pick from is scoped to the slot you're
filling), but it also gates the DRAG source tray, which conceptually should
be independent of which slot happens to be selected.

Confirmed via CDP: with slot A selected and full, `document.querySelectorAll
('button[draggable=true]')` returns 0 — there is no draggable card anywhere
on screen to start a drag from, even to drop onto a different, empty slot B.
Clicking slot B first (to make it selected and non-full) makes the grid
reappear, at which point dragging becomes almost redundant with just
clicking a tile directly.

**Why it matters**: a 30-minute slot reaches capacity the instant one
default-duration activity is added, which is the common case, not an edge
case — so this isn't rare. It undercuts the premise of "drag a card from the
picker onto any timeline slot" (the reworked `dropCard` reducer behavior)
whenever the user's last selection happens to be a full slot.

**How to apply**: when reviewing or re-testing drag-and-drop on this board,
always check whether the currently-selected slot is at capacity before
concluding "drag doesn't work" — the fix is either to declare this
acceptable UX (click an empty slot first) or to decouple the picker grid's
visibility from `atCapacity` when the intent is to serve as a drag source.
Not yet tracked in `OPEN-QUESTIONS.md` as of 2026-08-25.

See [[mindful-me-app-structure]].
