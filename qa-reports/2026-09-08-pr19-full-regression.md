# QA Regression Report — Full Pass

**Scope:** `claude/timeline-select-activity` (PR #19 on `avaneeshz/mindful-me`, not yet merged), commit `54c7ebe30aeb8a1cc1e8dd46b2e8aa0ada50e7ff`.
**Date:** 2026-09-08
**Cadence:** Full (per `QA-REGRESSION.md`'s cadence table) — every section, all three breakpoints (desktop 1440×960, ipad-land 1180×820 landscape, mobile 390×844), both themes where called for.
**Environment used:** `npm run dev` (local, no backend configured — graceful local-only mode). The live Vercel preview (`https://mindful-me-git-claude-timeline-select-activity-avaneesh3.vercel.app`) was not reachable through this environment's egress proxy (`CONNECT tunnel failed, response 403`), so local dev served as the tested surface per the task's fallback instruction.
**Tooling:** headless Chromium via Playwright 1.56.1 (preinstalled at `/opt/pw-browsers`, not reinstalled), driven with real `page.mouse.click`/`locator.click`/keyboard input — not just DOM inspection.

---

## Top-line verdict

**Not production-ready as-is.** Automated gates are all clean. Manual testing found **1 Major** finding (one root cause, two independent repro paths) that breaks the headline feature this PR round shipped — mouse/touch users cannot reliably select a *specific* activity on the timeline once its slot is already selected, or whenever a legacy flag marker shares the slot — plus **4 Minor** findings (one of them a **regression of a previously-known, previously-open issue** the checklist asks to specifically re-verify: it is still open). No Blocker-class (Non-negotiable Product Rule) violations were found; every rule in Section 6 that could be live-tested passed.

**Blocker: 0 · Major: 1 · Minor: 4**

| # | Severity | One-line description |
|---|---|---|
| M-1 | **Major** | Mouse click on a specific activity's timeline segment silently fails to select *that* activity — falls through to the covering plain slot button instead — whenever the slot is already selected (any 2-activity slot, second click) or carries a legacy flag marker (even on the very first click). Keyboard nav is unaffected; Slot view's own per-item Edit/Remove is a working alternate path. |
| m-1 | Minor | `SlotActivityList` text overlap at 390px is **still present** (checklist's named known issue) — a long path label (e.g. "Magnesium (post-dinner)") visually collides with the "15 min" duration text. |
| m-2 | Minor | Reflection-grid card titles that are a single long word ("Environment", "Boundaries") get hard-clipped with no wrap and no ellipsis at ipad-land and mobile widths — fine on desktop. |
| m-3 | Minor | `SlotEditor`'s "defaults to Slot view on first arrival" (checklist 2.2) does not hold for a slot that is 100%-covered by one activity (no plain-slot click target exists) when the Activity/Slot toggle's last state was Activity — a confirmed, deliberate design asymmetry, but the checklist's wording doesn't capture it. Documentation gap, not a functional bug. |
| m-4 | Minor | Pre-existing seed activity "Meal Prep" has an empty `path`, but its catalog card now requires a sub-selection (Breakfast/Lunch/Early Dinner/Later Dinner). Opening Edit on it leaves Save permanently disabled with no visible explanation — a real trap for any activity whose catalog requirements evolved after being scheduled. Not a PR19 regression; a pre-existing data/catalog mismatch surfaced by testing.

## Automated gates (Section 0)

| Gate | Result |
|---|---|
| **0.1** `npm run typecheck` | **PASS** — clean, zero errors. |
| **0.2** `npm test` | **PASS** — 24 test files, **473 tests**, all passing. (No prior report on file to diff the count against; noting 473 as this pass's baseline.) |
| **0.3** `npm run build` | **PASS** — succeeds. Only the pre-existing, known main-chunk-size warning (`index-*.js` 658.88 kB / gzip 192.33 kB, "chunks larger than 500 kB"); no new warnings. |

---

## Section-by-section results

### 1. Timeline strip & activity selection

| # | Result | Notes |
|---|---|---|
| 1.1 | **PASS** | Empty slot (33 = 16:30) selects with no toggle, tile-row add flow visible. All 3 breakpoints. |
| 1.2 | **FAIL — see M-1** | Packed slot (29 = 14:30–15:00, Body Care 15 min + Supplements 15 min) — the *first* click on either activity correctly resolves to that activity; a *second* click on the *other* activity in the same (now-selected) slot does not register at all (see M-1). |
| 1.3 | **PASS** | Night Sleep (00:00–08:00, seed-1) renders as 2 segments — one in the Night row (00:00–06:00 portion) and one in the Day row (06:00–08:00 portion, since it crosses the Day/Night row boundary at 6am). Clicking either segment resolves to the same activity (`Night Sleep`, correct 00:00–08:00 range shown). Verified at start/middle-adjacent and end-adjacent positions via both segments. |
| 1.4 | **PASS** | Keyboard: focus on an activity segment, `ArrowRight`/`ArrowLeft` move the roving stop across slot cells and activity segments in left-to-right time order (verified: `seed-9`→`ArrowRight`→lands exactly on `seed-10`, the correct next stop). `Home`/`End` jump to each row's first/last stop. `ArrowUp`/`ArrowDown` switch Day/Night rows landing at a proportionally equivalent position, and round-trip back to the original stop. **Keyboard navigation is not affected by the M-1 click bug** — `Enter` on a focused segment activates it correctly even in states where a mouse click on the same element would fail. |
| 1.5 | **PASS** | A slot with zero free capacity (e.g. slot 16, fully covered by Daily Sunlight) has its plain slot button at `tabindex="-1"` — dropped from the Tab sequence, matching what a mouse click resolves to (the covering activity, not the slot). |
| 1.6/1.7 | **Not exercised live** — see "What was not tested." |
| 1.8 | **PASS** | Exactly one NOW marker renders (on whichever row holds live time) when viewing today; navigating to a past day (Sep 5) via the date picker removes it entirely (count = 0). |
| 1.9 | **Not directly exercised** — the seed data has no naturally midnight-crossing activity (Night Sleep starts exactly at 00:00, so it doesn't cross); see "What was not tested." |

### 2. Slot / Activity toggle panel

| # | Result | Notes |
|---|---|---|
| 2.1 | **PASS** | Zero-touching-activity slot → no toggle rendered, Slot content (empty list + tile row) shown directly. |
| 2.2 | **PASS, with a documented nuance — see m-3** | Arriving at a slot via a **plain slot click** always defaults to Slot view, even if Activity was last chosen (this is what makes 2.2 hold in the common case). Arriving via an **activity-segment click** (the only route into a 100%-covered slot) preserves whatever the toggle was last set to — confirmed deliberate per the shipping commit's own description ("asymmetry preserved, untouched"), but it means "first arrival" doesn't always mean Slot view. See m-3. |
| 2.3 | **PASS** | With the toggle on Activity and an activity clicked, `ActivitySummary` shows that exact activity's name/path/real time range/duration, only-present tag categories, notes-if-any, and a working Edit button. |
| 2.4 | **PASS** | Edit from the Activity summary opens `LogActivityModal` pre-populated with the viewed activity's real values (confirmed for a completed activity — see 4.3/6.4 below). |
| 2.5 | **PASS** | Clicking a genuinely empty slot snaps the panel back to Slot view even when Activity was the last-chosen toggle state (toggle disappears entirely, since the new slot has no activities). |
| 2.6 | **PASS** | Removing the activity currently shown in Activity view, then flipping back to Activity, does not show stale data — the panel correctly falls back to Slot view's empty state (`viewingActivityId` clears on removal, forcing `effectiveView` back to Slot). |
| 2.7 | **PASS** | A fully-booked slot (single activity, e.g. Meal Prep, or two 15-min activities packed to 30/30) shows the "This slot is full" `role="status"` note instead of the 9-tile picker; the existing-activity list and each item's own Edit/Remove remain fully functional. |
| 2.8 | **Spot-checked, no issue found** | Empty/partial/full/richly-tagged states all rendered within the panel's shared min-height without a visible jump across the states exercised (screenshots at all 3 breakpoints, both themes). |
| 2.9 | **PASS** | Toggle + slot-time text (left column) and Now/flag pills (right column, `ml-auto`) do not collide or wrap awkwardly at any of the 3 breakpoints tested. |

### 3. 9-tile category picker + popup

| # | Result | Notes |
|---|---|---|
| 3.1 | **PASS** | Clicking a category tile opens a real popup dialog (`role="dialog"`), not an inline panel. |
| 3.2 | **PASS** | Picking a sub-activity (`Day Sleep` under Sleep & Rest) closes the popup and opens `LogActivityModal` for that exact pick. |
| 3.3 | **PASS** | Escape, the dialog's own X, and an overlay click all close the popup without picking anything (dialog count → 0 each way). |
| 3.4 | **Verified via code + existing unit tests (16 in `disappear.test.ts`)**, spot-checked live: a locked (`auto:N`-exhausted) item renders `disabled`/`aria-hidden` and is unclickable (this is exactly what caused an early test-script false failure — "Night Sleep" was already locked from the seed data, correctly). Not independently re-derived live for the midnight-reset behavior — see "What was not tested." |
| 3.5 | **Not exercised live** — see "What was not tested." |

### 4. Log Activity modal

| # | Result | Notes |
|---|---|---|
| 4.1 | **PASS** | Fresh pick into an empty slot → duration defaults sensibly, Save is enabled, Save commits exactly the entered values (verified the new "Day Sleep" activity appears in the slot's list post-save). |
| 4.2 | **PASS** | Edit (via both Activity-summary Edit and Slot view's per-item Edit) pre-populates every field from the existing activity. |
| 4.3 / 6.4 | **PASS** | Marked "Errand time" completed → opened Edit (no fields touched) → Save changes was enabled and committed → **Completed badge still present afterward.** Rule 4 holds. (Note: this specific check had to be redone against "Errand time" rather than the originally-chosen "Meal Prep" — see m-4 for why Meal Prep specifically is a bad test subject, unrelated to rule 4 itself.) |
| 4.4 / 6.11 | **PASS** | Editing "Errand time" (30 min, immediately followed by Homework with no gap) shows the drag-block's "Capped — a neighbouring activity (or the end of the day) starts right there" hint rather than allowing an overlap. |
| 4.5 | **PASS** | Cancel (the modal's X) discards the staged pick entirely — panel returns to the plain empty-slot state, nothing written. |
| 4.6 / 6.8 | **PASS by construction, not literally "disabled on press"** — see notes below. |
| 4.7 | **PASS** | An activity saved with an untouched (empty) notes field shows no "Notes" heading at all in `ActivitySummary` — confirms it commits as `null`, not `""`. |

**On 4.6/6.8 (double-submit guard):** `LogActivityModal`'s Save button has no explicit "disable while a write resolves" state distinct from `canCommit`. In practice this is safe: `commit` is a synchronous reducer action — the modal closes (`staging.cardName` → `null`) on the very first click, in the same tick, so there is no window in which a second click can land on the same Save button for the same staged entry. This satisfies the *intent* of rules 6/9 (no double-write is possible) without literally implementing a disabled-during-write state, because there is no async gap to exploit in this local-first architecture. Flagging as a note rather than a failure, but worth knowing if the modal's save path ever becomes genuinely async (server round-trip in the foreground) — at that point this would need a real guard.

### 5. Reflection cards section

| # | Result | Notes |
|---|---|---|
| 5.1 | **PASS** | All 18 cards render with correct image/number/title/subtitle in source order; 2 rows of 9 on desktop. |
| 5.2 | **FAIL — see m-2** | Text-cutting-off confirmed at mobile and ipad-land widths for single-long-word titles. |
| 5.3 | **PASS** | Confirmed non-interactive — plain `<div>`s, no click handler, per `ReflectionSection.tsx`'s own doc comment; still accurate. |

### 6. Non-negotiable Product Rules (Blocker-class — tested exhaustively, not spot-checked)

| Rule | Result | Notes |
|---|---|---|
| **1** No overlap, ever | **PASS (via clamp evidence + 50 passing `scheduling.test.ts` unit tests)** | Live-verified the clamp path (4.4/6.11 above: duration is capped at the neighbouring activity's start, "Capped" hint shown, never allowed to overlap). Did not additionally force an overlap via raw drag simulation — see "What was not tested" for why, and why the unit-test coverage here is unusually strong (50 dedicated tests covering exactly this). |
| **2** Midnight-crossing = one row, aggregates split correctly | **Not independently re-verified this pass — code-reviewed only** | No midnight-crossing activity exists in seed data to click through; `domain/slots.ts`/`domain/scheduling.ts` model it as one row by construction (arbitrary minutes, not slot-array), and this is unchanged by PR19's diff. No aggregation UI exists yet to check "aggregates split minutes across both days" against (Phase 4, not merged to `main` per `full-stack-engineer.md`). |
| **3** Wall-clock time locked at creation, DST/tz-change-proof | **Code-reviewed, not live OS-timezone-tested** | `lib/localTime.ts`: `ScheduledActivity.startMinutes`/`durationMinutes` are plain integers set once at creation and never recomputed from a stored absolute instant; `timezone` is recorded alongside but never used to reconvert display. Structurally satisfies the rule; not verified against an actual OS timezone flip in this pass. |
| **4** Edit never silently clears completion | **PASS** | See 4.3/6.4 above — live-verified. |
| **5** Drop snaps to a friendly time, never auto-commits | **PASS (structural/code)** | `dropCard` composes `selectSlot`+`pickCard` (verified in `boardReducer.ts`), which stages via `computeCandidateSchedule` and opens the confirm-duration modal — never writes to `activities` directly. Native HTML5 drag-and-drop itself was not simulated (see "What was not tested"), but the reducer path a drop takes is code-identical to the click-to-place path already live-verified in 4.1. |
| **6** Every write lands locally first, works fully offline | **PASS** | Live-verified with `context.setOffline(true)` (real network blocked, not just devtools throttling): adding a brand-new activity to an empty slot, and toggling an existing activity's completed status, both worked instantly and correctly while offline. |
| **7** Conflicting edits: newest wins, kept in audit trail | **N/A this pass** | Requires two-device/Phase-5 sync hardening, which is explicitly "in progress," not merged to `main`, and out of scope per `full-stack-engineer.md`'s migration-phase table. |
| **8** "Today"/"this week" reads scoped, never full history | **Not independently re-verified — code-reviewed only** | No aggregation/history UI exists yet to exercise this against (Phase 4). `BoardContext` seeds/loads one `viewedDate` at a time by construction. |
| **9** Save can't be double-clicked into a dup write | **PASS by construction** — see 4.6/6.8 notes above. |
| **11** Delete immediate + recoverable (undo) | **PASS (client-side undo verified; 30-day-purge is a backend concern not exercised)** | Live-verified: Remove takes the activity out of the list immediately, a `role="status"` "Removed [name] · Undo" row appears, and Undo restores it correctly. The 30-day-then-purge backend retention policy was not exercised (no backend configured this pass). |
| **12** Editing a past day always allowed, no lock | **PASS** | Live-verified: navigated to Sep 5 via the date picker (NOW marker correctly absent there), selected an empty slot, opened the tile picker, picked an item — Save was enabled exactly as on today. |
| **13** Doesn't fit contiguously → offer max contiguous, never split | **PASS** | See 4.4/6.11 above. |

### 7. Theme

| # | Result | Notes |
|---|---|---|
| 7.1 | **PASS** | Sun/Moon end-caps toggle light/dark (`data-theme` attribute set/cleared correctly); the active cap shows `aria-pressed="true"` with the inverted fill treatment. |
| 7.2 | **Not independently re-verified this pass** — unchanged by this PR round per its own commit messages ("sun/moon glow... unchanged"); code inspected, still keys off real device time independent of the chosen theme. |
| 7.3 | **PASS, no contrast/unstyled-text issues found** | Screenshotted the Activity-view (rich, tagged activity) and the Reflection grid in dark theme at desktop — legible, consistent with the light-theme pass, no unstyled elements. |

### 8. Responsive

| # | Result | Notes |
|---|---|---|
| 8.1 | **FAIL — see m-1 (SlotActivityList text overlap, confirmed STILL OPEN)** | This is the checklist's own named "previously-known" issue — status is **still open**, not fixed. Screenshot evidence in the findings section below. |
| 8.2 | **FAIL — see m-2 (reflection-card title clipping also reproduces at ipad-land)** | Everything else checked at ipad-land (timeline rows, SlotEditor panel, tile popup, log modal) reflowed correctly with the documented tightened vertical spacing — no other clipping found. |

### 9. Accessibility

| # | Result | Notes |
|---|---|---|
| 9.1 | **PASS** | Programmatic sweep of every `button`/`[role=radio]`/`[role=checkbox]` on the loaded page found **0** missing an accessible name (`aria-label`, text content, or `aria-labelledby`). |
| 9.2 | **Spot-checked via code, not exhaustively tab-walked** | `focus-visible:outline` classes are present consistently across every interactive component read during this pass (Timeline slots/segments, toggle chips, tile buttons, modal controls, date picker cells). Roving-tabindex behavior for the timeline (1.4) was live-verified and correct. Did not walk the entire page's Tab order end-to-end hunting for a trap. |
| 9.3 | **PASS** | "This slot is full" renders with `role="status"`; the undo row also uses `role="status"` — confirmed via code and confirmed present in a live DOM query. |

### 10. Data persistence / local-first

| # | Result | Notes |
|---|---|---|
| 10.1 | **PASS** | Hard reload (`page.reload`) preserves the board — verified the seed data's Night Sleep activity (both its row segments) is still present after reload, in the same session where a newly-added activity ("Day Sleep") had also just been committed. |
| 10.2 | **PASS** | The entire pass ran with zero backend configured (`app/.env` never created) — the app was fully usable end-to-end throughout: add/edit/complete/remove/theme/date-navigation all worked with no backend at all, exactly as rule 6/Phase 2's "graceful local-only mode" specifies. |

---

## Findings in detail

### M-1 (Major) — Clicking a specific activity's timeline segment doesn't reliably resolve to that activity

**This is the headline finding, and it is exactly the behavior this QA pass was commissioned to verify.**

**Root cause (confirmed via `getComputedStyle`/`elementFromPoint`, not just click failures):** in `Timeline.tsx`, each activity's clickable segment lives inside an overlay `<div className="pointer-events-none absolute inset-0 z-[1]">`, with the individual segment `<button>`s set to `z-[5]`. That `z-[5]` only wins against *other children of that same wrapper* — it cannot out-rank a **sibling** of the wrapper itself, and the wrapper's own stacking value is `z-[1]`. Two different siblings legitimately carry a higher z-index than that `1`:

1. The plain per-slot `<button>`, once it is the **selected** slot, gets `z-[2]` (`isSelected && 'z-[2] ...'`). Since `2 > 1`, the *entire* activity overlay — every segment inside it, regardless of its own `z-[5]` — now paints and hit-tests **below** that selected slot's button.
2. A legacy whole-slot flag-marker dot (`<span>` inside the plain slot button, decorative, `aria-hidden`) is explicitly set to `z-[6]` ("so it stays visible even under an activity-segment button" — see the code comment). `6 > 1` as well, so that decorative dot also wins hit-testing over the entire activity overlay, **even when the slot was never selected at all.**

**Repro 1 — already-selected slot with 2+ activities (the primary, most common case):**
1. Fresh page load. Click `Body Care (self)` (14:30–14:45) on the timeline → correctly selects slot 29, Activity view shows Body Care. (Confirms 1.2's happy path.)
2. Click `Supplements` (14:45–15:00), the *other* activity sharing slot 29, which is now the selected slot.
3. **Expected:** Activity view switches to show Supplements.
4. **Actual:** The click does not register on Supplements at all. `document.elementFromPoint` at the exact center of Supplements' rendered segment returns the **plain slot-29 button**, not the Supplements button. A real `page.mouse.click` at that exact pixel dispatches a same-slot reselect (a no-op that clears `viewingActivityId`), which snaps the panel back to **Slot** view — the toggle pill itself visibly flips from "Activity" to "Slot" as a side effect, with no error or indication to the user that their click on Supplements failed.
5. This reproduces in **both directions** (Body Care → Supplements and Supplements → Body Care) and at **all three breakpoints** (desktop/ipad-land/mobile) and is unrelated to theme.

**Repro 2 — legacy flag-marker slot, no prior selection needed:**
1. Fresh page load, nothing clicked yet. `Homework` (15:30–16:00, slot 31) shares its slot with a legacy whole-slot flag marker ("Attack").
2. `document.elementFromPoint` at the exact center of Homework's rendered segment returns the flag-marker `<span>` (`class="size-[6px] rounded-full bg-inv-ink"`), whose closest `[data-slot]` is 31 — **not** the Homework activity button.
3. A real click there resolves to selecting the slot, not Homework specifically.

**What still works (the impact is real but bounded):**
- **Keyboard is entirely unaffected.** Roving-tabindex `Tab`/`Arrow`/`Enter` navigation (section 1.4) resolves correctly in every case tested, including the exact scenarios above — `Enter` fires the click handler directly on the focused element, bypassing pixel-based hit-testing entirely.
- **Slot view's own per-item Edit/Remove buttons are a fully working alternate path** — each list row in `SlotActivityList` is wired to its own `activity.id` regardless of which one was "selected," so a user can still reach and edit/remove the *specific* activity they want via Slot view even when the direct timeline-click-to-Activity-summary path fails.
- Data integrity is not at risk — this is a click-routing/selection bug, not a scheduling or persistence bug.

**Expected vs. actual, restated simply:** clicking a specific activity's own segment should always resolve to *that* activity (checklist 1.2); once a slot has been selected once, or whenever it carries a legacy flag marker, a mouse click on a second/different activity in that slot silently does the wrong thing instead.

**Breakpoints:** desktop, ipad-land, mobile — identical (this is a CSS stacking-context bug, not a layout/responsive one).
**Theme:** unaffected either way.
**Rule violated:** none of the 13 Non-negotiable Product Rules directly (no data loss, no overlap, no scheduling-correctness break) — this is why it's scored Major rather than Blocker — but it is a clear regression of the specific feature commit `df613c8`/`93e6f9c` shipped this round ("make timeline activity segments real, focusable click targets" / "read-only Activity summary view").
**Suggested fix direction** (for `full-stack-engineer`, not applied here): raise the activity-overlay wrapper's `z-[1]` to something higher than `z-[2]` (the selected slot) and `z-[6]` (the flag-marker dot) — e.g. `z-[7]` — or, more surgically, give the flag-marker `<span>` `pointer-events-none` (it's already `aria-hidden`, decorative, and doesn't need to intercept clicks at all) and bump the wrapper above the selected-slot's `z-[2]`.

---

### m-1 (Minor) — `SlotActivityList` text overlap at 390px is still open

Checklist item 8.1 names this explicitly and asks for a fresh status check rather than an assumption. **Status: still open, not fixed.**

**Repro:** at exactly 390px width, select slot 29 (packed with Body Care 15 min + Supplements 15 min) in Slot view. The "Supplements" row's path label ("Magnesium (post-dinner)") visually collides with the "15 min" duration text — they render on top of each other ("Magnes" and "15 min" overlap directly), before "(post-" wraps awkwardly to its own line below.

Screenshot evidence saved during this pass (not committed to the repo, available on request): a crop shows "Magnes█5 min" rendered as overlapping text.

**Breakpoint:** mobile (390px specifically — the checklist's own named width). Not reproduced at ipad-land or desktop (more horizontal room).
**Theme:** not theme-dependent (a layout issue).
**Severity reasoning:** cosmetic/legibility only — Edit/Remove buttons remain present and clickable to the side; no data or functional loss. Still worth fixing given CLAUDE.md's explicit "beautiful but restrained visual design" bar and that this exact regression was already known before this round.

---

### m-2 (Minor) — Reflection-grid title clipping for single-long-word titles (ipad-land + mobile)

**Repro:** scroll to the Reflection section. Card 4 ("Environment") and card 7 ("Boundaries") — both single long words — render as "4. **Environme**" and "7. **Boundarie**" with a hard cut, no wrap to a second line, no ellipsis. Reproduces at both **ipad-land** (1180px, 9-column grid) and **mobile** (390px, 3-column grid); does **not** reproduce on **desktop** (1440px — enough width per column).

**Root cause (from code review):** `ReflectionCardTile`'s title `<p>` has no `break-words`/`overflow-wrap` utility, and its ancestor tile `<div>` sets `overflow-hidden`. Multi-word titles ("Couldn't ask/tell," "Self Harm") wrap fine at the space; a single word wider than the column has nowhere to break, so it overflows horizontally and gets silently clipped by the ancestor's `overflow-hidden`.

**Breakpoints:** ipad-land, mobile. Not desktop.
**Theme:** not theme-dependent.
**Severity reasoning:** cosmetic, static/non-interactive section (5.3), but a clear violation of checklist 5.2's explicit "without cutting off text" criterion and CLAUDE.md's polish bar. Suggested fix direction: add `break-words` (or `overflow-wrap: break-word`) to the title `<p>` in `ReflectionSection.tsx`.

---

### m-3 (Minor / documentation gap) — Checklist 2.2's "first arrival" wording doesn't hold for 100%-covered slots

Not a functional bug — a confirmed, deliberate design decision (per commit `b0bf2ad`'s own description: "Once `selectActivity` sets a real `viewingActivityId`, `view` is respected again — asymmetry preserved, untouched") — but worth recording because it's a real, reproducible gap between the checklist's literal wording and actual behavior:

**Repro:** flip the toggle to Activity on any slot (e.g. via `seed-9`). Then click a **brand-new, never-visited, 100%-covered** slot (e.g. `seed-8`, Sports or Exercise — no free capacity, so the *only* click target into that slot is its own activity segment, there is no plain-slot click route in). **Expected per 2.2's literal text:** defaults to Slot view. **Actual:** shows Activity view (Sports or Exercise's summary), because arriving via an activity click (as is unavoidable here) preserves whatever the toggle was last set to, rather than resetting to Slot.

This is correct, intended behavior for the common case (2.2 holds whenever a plain-slot click is available, which is most of the time), but 100%-covered slots have no plain-slot click route by construction, so the asymmetry is reachable by anyone in normal use. **Recommendation:** extend `QA-REGRESSION.md`'s item 2.2 to explicitly scope "first arrival via a plain slot click" versus "first arrival via an activity segment (preserves the last-chosen toggle)" — this is exactly the kind of gap `qa-engineer.md` says to add rather than silently narrow around.

---

### m-4 (Minor) — Pre-existing seed/catalog mismatch traps Edit on "Meal Prep"

Discovered while setting up the rule-4 (completion-preservation) test — **not a PR19 regression**, but a real, reproducible trap:

**Repro:** the seed data's `Meal Prep` activity (`seed.ts`) was created with an empty `path: []`. The current catalog card for "Meal Prep" (`data/activities.ts`) has since gained `sub: ['Breakfast', 'Lunch', 'Early Dinner', 'Later Dinner']` — a required drill-down. Clicking Edit on this specific seeded activity opens `LogActivityModal` with Save **permanently disabled**, and nothing in the modal explains why (no inline "select an option" hint near the four now-required chips) — a user has to notice the disabled button, infer they need to pick a meal type, do so, and only then can they save the *unrelated* change they actually opened Edit for.

This is `isStagingComplete`'s intended behavior working exactly as designed against the *current* catalog (`if (staging.path.length === 0) return false`) — the bug is that pre-existing/seeded data can silently fall out of sync with catalog requirements with no surfaced explanation. Any future real-world equivalent (a synced activity logged before a category gained a required sub-option) would hit the same silent trap.
**Severity reasoning:** edge case, no data loss (Cancel still discards cleanly), but a genuine discoverability gap.

---

## What was NOT tested, and why

- **Native HTML5 drag-and-drop** (1.6, 1.7, 3.5, and the drag half of rule 5) — not simulated live. Headless Playwright's synthetic `dragstart`/`dragover`/`drop` event sequence does not reliably trigger real HTML5 DnD handlers the way genuine OS-level drag input does, and this environment doesn't have a way to do real OS-level pointer drag against a headless browser. Confidence here comes from: (a) `dropCard`'s reducer path is code-identical to the click-to-place path already live-verified (composes `selectSlot`+`pickCard`, opens the same confirm modal, never auto-commits), and (b) `Timeline.test.tsx` (13 tests) already exercises this at the SSR-string level per the project's own stated testing convention. This is a real gap, not a confident pass — a dedicated drag-simulation pass (or manual human testing) is recommended before shipping.
- **Midnight-crossing activity** (1.9, rule 2's aggregation half) — no such activity exists in seed data, and there's no aggregation UI yet (Phase 4, not merged to `main`) to check the "splits minutes across both calendar days" half of rule 2 against. Structurally reviewed the domain code only.
- **Live OS timezone/DST change** (rule 3) — reviewed `lib/localTime.ts` and its 16 passing unit tests; did not flip the container's actual system timezone mid-session to force a live repro.
- **Two-device conflicting edits** (rule 7) — explicitly out of scope per the task's own instruction; Phase 5 sync hardening isn't merged to `main`.
- **"Today"/"this week" query scoping** (rule 8) — no aggregation/rollup UI exists yet to exercise this against.
- **30-day soft-delete purge** (the back half of rule 11) — no backend was configured this pass (by design, to exercise rule 6/10.2's local-only mode); undo/immediate-removal was verified, the backend retention policy was not.
- **Full end-to-end screen-reader pass** (9.1/9.2 beyond the programmatic sweep and spot-checks already described) — a real screen reader (VoiceOver/NVDA) was not used; relied on an automated accessible-name sweep plus code-level `focus-visible`/roving-tabindex verification.
- **3.4's midnight-reset behavior specifically** (an `auto:N` item unlocking again at local midnight) — relied on the existing 16 passing `disappear.test.ts` unit tests plus a live spot-check that already-locked items render correctly; did not force a live midnight rollover.
- **`auto:N` and `manual` disappear-rule interplay across all 9 categories exhaustively** — spot-checked one (`Night Sleep`, already-locked) rather than walking all categories.

---

*Report by qa-engineer, following `.claude/agents/qa-engineer.md` and `QA-REGRESSION.md`. No `app/src/**` files were edited during this pass.*
