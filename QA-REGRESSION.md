# QA Regression Checklist

Maintained by **qa-engineer** (`.claude/agents/qa-engineer.md`), used alongside **full-stack-engineer**'s own before-calling-it-done checks. This is a living document — when a real bug reveals a scenario this checklist didn't cover, add it here; never silently narrow the list to make a pass look cleaner.

Every scenario is tagged with a cadence:

* **[S] Smoke** — run after every PR merge / at least once a day during active development. Fast: happy paths, the areas most recently touched, and a spot-check of the Non-negotiable Product Rules (section 6). Should take well under an hour driving the real app.
* **[F] Full** — run at least weekly, and before anything gets called "production-ready" (see `.claude/skills/release-review.md`). Every scenario below, at every breakpoint, both themes.

Unless a scenario says otherwise, test at all three breakpoints — **desktop**, **ipad-land** (`tailwind.config.js`'s custom breakpoint), **mobile** (`max-width: 768px`, the app's one global breakpoint) — and in both **light** and **dark** theme for a Full pass; Smoke can stay desktop + one theme unless the PR under test touched responsive layout or theming directly.

---

## 0. Automated gates — every pass, no exceptions

- [ ] **0.1** [S/F] `npm run typecheck` — clean, zero errors.
- [ ] **0.2** [S/F] `npm test` — all suites passing; note the exact pass count and compare it to the prior report (a shrinking count without an explained deletion is itself a finding).
- [ ] **0.3** [F] `npm run build` — succeeds, no new warnings beyond the known main-chunk-size notice.

## 1. Timeline strip & activity selection

- [ ] **1.1** [S] Click a genuinely empty 30-minute slot → selects that slot (no modal, no activity summary), tile row / add flow available for it.
- [ ] **1.2** [S] Click directly on a scheduled activity's own rendered segment → resolves to *that* activity, not the enclosing slot — verify with a slot holding 2–3 short (e.g. 10-minute) back-to-back activities, clicking each one individually lands on the right one.
- [ ] **1.3** [S] Click anywhere along a multi-hour activity's span (start, middle, end) → all resolve to that same activity.
- [ ] **1.4** [F] Keyboard: Tab reaches the timeline; arrow keys move the roving tab stop across both slot cells and individual activity segments in left-to-right time order; Home/End jump to row ends; Up/Down switch Day/Night rows landing on a sensible equivalent position.
- [ ] **1.5** [F] A slot with zero remaining free capacity drops out of the keyboard tab sequence as a "select slot" stop (the covering activity segment(s) are the only reachable stop there) — confirm this matches what a mouse click does (click never lands on the plain slot button under a full-coverage activity).
- [ ] **1.6** [S] Drag a card from the tile-row popup onto an empty slot → opens the log/edit modal pre-populated at that time, does not auto-commit.
- [ ] **1.7** [F] Drag a card onto a spot already covered by an existing activity → does not silently fail; resolves per rule 5 (snaps to the next free instant), still opens the confirm modal rather than auto-committing.
- [ ] **1.8** [S] Current-time (NOW) marker appears on exactly one row (whichever is live), and only when viewing today — switching to a past/future day removes it entirely.
- [ ] **1.9** [F] Midnight-crossing activity (starts before midnight, ends after): renders as one continuous visual block across the Night row's wrap point, not two.

## 2. Slot / Activity toggle panel (`SlotEditor.tsx`)

- [ ] **2.1** [S] Slot with zero touching activities → no toggle rendered at all; panel shows Slot content directly (empty activity list + tile row, since there's free room).
- [ ] **2.2** [S] Slot with ≥1 activity → toggle visible, defaults to **Slot** view on first arrival at that slot.
- [ ] **2.3** [S] Clicking an activity segment on the timeline while the toggle is on **Activity** → shows that activity's read-only summary (name, path, real time range + duration, activity quality / protective response / chronic symptoms tags only for categories actually present, notes if any) with a working **Edit** button.
- [ ] **2.4** [S] Edit button in the Activity summary → opens `LogActivityModal` pre-populated with that exact activity's current values (not defaults).
- [ ] **2.5** [S] Clicking a genuinely empty slot (or the free remainder of a partially-filled one) → panel snaps back to **Slot** view automatically, even if Activity was the last-selected toggle state.
- [ ] **2.6** [F] Removing the activity currently shown in Activity view (via the Slot view's own Remove, then flipping back) → panel doesn't get stuck showing a stale/removed activity; snaps to Slot's empty state.
- [ ] **2.7** [S] Fully-booked slot (zero free capacity) in Slot view → the 9-tile add picker does **not** render; a one-line "this slot is full" status shows instead; the existing-activity list is still fully visible and each entry's own Edit/Remove still works.
- [ ] **2.8** [F] Slot/Activity view heights stay visually consistent when toggling back and forth — no visible jump — across: empty, partial, full, and an activity carrying all three tag categories plus notes.
- [ ] **2.9** [F] Header layout: toggle (+ smaller time text beneath it, Slot view only) doesn't wrap awkwardly at any breakpoint; Now/flag pills remain legible alongside it.

## 3. 9-tile category picker + popup (`TileRow.tsx`)

- [ ] **3.1** [S] Clicking one of the 9 category tiles opens a popup dialog (not an inline panel pushing content down) listing that category's sub-activities.
- [ ] **3.2** [S] Picking a sub-activity from the popup closes it and opens `LogActivityModal` for that pick.
- [ ] **3.3** [F] Escape, the dialog's own close (X), and clicking the overlay all close the popup without picking anything.
- [ ] **3.4** [F] `auto:N` disappear-rule items lock (show as done/disabled) once scheduled `N` times today; `manual` items only lock via their own explicit "mark done" toggle. Both reset at local midnight.
- [ ] **3.5** [F] Dragging a sub-activity chip directly onto the timeline works the same as picking it from the popup then placing it.

## 4. Log Activity modal (`LogActivityModal.tsx`)

- [ ] **4.1** [S] Add flow: pick a card → duration drag-block defaults sensibly, quality/protective-response/symptoms/notes all empty by default → Save commits a new activity with exactly the entered values.
- [ ] **4.2** [S] Edit flow (via Activity-summary Edit, or the Slot view's own per-item Edit): every field — duration, start time, activity quality (multi-select), protective response (single-select, "None" default), chronic symptoms (multi-select), notes — is pre-populated from the existing activity, not reset to defaults.
- [ ] **4.3** [F] Editing time/duration on a **completed** activity never silently clears its completed status (rule 4) — verify explicitly, this is easy to regress silently.
- [ ] **4.4** [F] Duration can't exceed the continuous free block available from the (possibly moved) start time — the modal clamps rather than allowing an overlap.
- [ ] **4.5** [S] Cancel discards the staged pick/edit entirely; nothing is written until Save.
- [ ] **4.6** [F] Save button guards against double-submit (disabled immediately on press until the write resolves).
- [ ] **4.7** [F] An empty notes textarea commits as "no notes," never a stored empty string.

## 5. Reflection cards section (18-card static grid)

- [ ] **5.1** [S] All 18 cards render with the correct image, number, title, and subtitle, in the same order as the source design (two rows of nine on desktop).
- [ ] **5.2** [F] Grid collapses to the documented mobile column count without cutting off text or images.
- [ ] **5.3** [S] Cards are confirmed non-interactive (no click handler) per the current product decision — if this has since changed, update this line and re-test accordingly rather than assuming stale.

## 6. Non-negotiable Product Rules — spot-check every Smoke pass, verify exhaustively every Full pass

(Numbering matches `.claude/agents/full-stack-engineer.md`'s own list — treat any violation found here as a **Blocker** by definition.)

- [ ] **6.1** [S] Rule 1 — No two activities can ever overlap. Try to create one anyway via drag, via the modal, and via editing an existing activity's time into another's span; every path must refuse.
- [ ] **6.2** [F] Rule 2 — A midnight-crossing activity is one row; daily/weekly aggregates split its minutes correctly across both calendar days (check any rollup UI that exists, or the raw data if none does yet).
- [ ] **6.3** [F] Rule 3 — Changing device timezone (or simulating a DST boundary) never retroactively shifts an already-logged activity's displayed time.
- [ ] **6.4** [S] Rule 4 — Editing time/duration on a completed activity never clears completion (duplicate of 4.3, kept here since it's a Blocker-class rule).
- [ ] **6.5** [S] Rule 5 — A drop always snaps to a friendly nearby time and opens the duration-confirm step; it never auto-commits on drop.
- [ ] **6.6** [F] Rule 6 — With the network blocked/offline (devtools throttling or a pulled cable), every add/edit/remove still works instantly against local state.
- [ ] **6.7** [F] Rule 7 — (Requires two sessions/devices editing the same activity — test only when Phase 5 sync hardening is actually in scope for the release under review; otherwise mark N/A and say why.)
- [ ] **6.8** [S] Rule 9 — Save button can't be double-clicked into a duplicate write.
- [ ] **6.9** [F] Rule 11 — Delete removes an activity from view immediately; confirm the undo affordance appears and actually restores it within its window.
- [ ] **6.10** [F] Rule 12 — Editing a past day's activities works with no lock/restriction.
- [ ] **6.11** [F] Rule 13 — Requesting a duration that doesn't fit contiguously offers the max contiguous duration instead of splitting across two gaps.

## 7. Theme

- [ ] **7.1** [S] Sun/Moon end-caps toggle light/dark theme; the selected cap shows the invert-pair "selected" treatment.
- [ ] **7.2** [F] The live-time glow on the Day/Night end-cap tracks real device time, independent of which theme is currently chosen (both-true and both-false combinations should be reachable).
- [ ] **7.3** [F] Every screen touched by the current PR renders correctly in both themes — no unstyled/invisible text, no contrast failures.

## 8. Responsive

- [ ] **8.1** [F] Every surface in scope (timeline, slot/activity panel, tile popups, reflection grid, log-activity modal) reflows correctly — not just shrinks — at mobile width; check specifically for the previously-known `SlotActivityList` text-overlap issue at 390px and confirm current status (fixed / still open) rather than assuming.
- [ ] **8.2** [F] ipad-landscape's tightened vertical spacing doesn't clip or truncate anything.

## 9. Accessibility

- [ ] **9.1** [F] Every interactive control has a real accessible name (aria-label or visible text) — spot-check with a screen reader or the accessibility tree, not just visually.
- [ ] **9.2** [F] Focus is visible on every interactive element reachable by keyboard; nothing is a keyboard trap.
- [ ] **9.3** [F] Capacity/status text (e.g. "this slot is full") is announced via `role="status"`/equivalent, not conveyed by color alone.

## 10. Data persistence / local-first

- [ ] **10.1** [S] A hard page reload preserves today's committed activities (local persistence round-trip).
- [ ] **10.2** [F] With zero backend configured, the app is still fully usable end-to-end (graceful local-only mode).

---

## Cadence summary

| Cadence | When | Scope |
|---|---|---|
| **Smoke** | Every PR merge, or daily during active development | All `[S]` items above — happy paths, most-recently-changed areas, a spot-check of the Blocker-class rules in section 6. |
| **Full** | Weekly, and before any "production-ready" call | Every item in this document, every breakpoint, both themes. |

Every pass — Smoke or Full — gets a written report per `.claude/agents/qa-engineer.md`'s Reporting section, referencing this checklist's item numbers.
