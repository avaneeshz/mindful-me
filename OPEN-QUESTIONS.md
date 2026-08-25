# Open Questions — mindful-me

Genuine unresolved product/design decisions surfaced during the "30-Minute
Slotting" redesign and the subsequent stabilization pass. This file exists
so unresolved decisions get tracked and *don't* silently become de facto
answers just because current behavior happens to preserve them. Nothing
here should be treated as decided until someone actually decides it.

Per project convention: this is current-state documentation, not a
permanent list — items get resolved and removed, and new ones get added,
as the product evolves.

---

## 1. Midnight rollover / multi-day state

### Question
The app now derives "now" from real device time and splits the day into
Day/Night rows — but the underlying data model is a single array of 48
slots with no date attached. What should happen at midnight, and how
should multiple days be represented?

### Current behavior
State is keyed 0–47 with no day dimension. The Night row's post-midnight
half (indices 0–11) is *today's* early morning, not tomorrow's. Nothing
rolls the board over at midnight — if the tab stays open past midnight,
"now" will jump to slot 0 while all of yesterday's entries are still
sitting in the same slots, now mislabeled as "today."

### Why it matters
This was always true of the original prototype, but it was invisible
there (no real "now," no Day/Night split to expose it). It's now a real,
visible functional gap, not just a theoretical one.

### Options
- Add a date-keyed store (`Record<dateISO, DaySlots>`) — the "real" fix,
  but a genuine data-model/persistence decision, not a frontend-only one.
- A lightweight interim fix: reset in-memory state at midnight (still
  loses history on reload, matching current no-persistence behavior, but
  at least stops showing stale entries as "today's").
- Do nothing until persistence is designed — accept the gap for now.

### Current temporary decision
Preserved exactly as the prototype's original model — no date dimension,
no rollover logic. Not addressed by the stabilization pass per instruction
not to invent product/data-model decisions.

### Recommendation
This should be resolved as part of whatever persistence/backend decision
comes next, not solved in isolation — a date-keyed store is needed either
way once real persistence lands.

### Priority
P1 — not blocking single-session use, but a real correctness gap the
moment the app is used across a real day boundary.

---

## 2. Real weather data

### Question
The header's weather pill shows placeholder data (28°C, Hyderabad). Should
this become real, and if so, from what source (provider, location
detection, units)?

### Current behavior
Kept per your explicit decision, restyled to match the simplified header,
loudly marked as `PLACEHOLDER_WEATHER` in code with an sr-only note.

### Why it matters
Fake data next to an otherwise "honest" redesigned header is a values
tension your own brief called out — you chose to keep it for now with
future backend integration in mind.

### Options
- Wire a real weather API + location source when backend work begins.
- Remove entirely if it turns out not to be worth a real integration.
- Leave as an intentional, clearly-marked placeholder indefinitely.

### Current temporary decision
Placeholder, kept, clearly marked in code.

### Recommendation
Defer until backend/persistence work begins — no frontend action needed
until then.

### Priority
P2

---

## 3. Activity-level flags

### Question
Flags (Trauma/Stress/Fear response) currently attach to a whole slot, not
to a specific one of up to two activities within it. Should this change?

### Current behavior
Unchanged from the original prototype — flags remain whole-slot markers.
This was already an open question in PRODUCT-HANDOFF.md §4.2/§9 before
this redesign began, and the redesign explicitly deferred touching it.

### Why it matters
If a slot has both "Body care" and "Supplements" logged, a flag can't
indicate which one it's about. Resolving this would need a data-model
change (flags currently aren't associated with individual activity
entries).

### Options
- Leave whole-slot (simplest, no data-model change).
- Move flags to attach to a specific activity entry (clearer semantics,
  requires a schema change).
- Allow both a slot-level flag and per-activity flags (more flexible,
  more complex).

### Current temporary decision
Whole-slot, unchanged — explicitly frozen per your decision during the
redesign approval process.

### Recommendation
Revisit alongside any future backend/data-model work, not in isolation.

### Priority
P2

---

## 4. Mind & Rest category color fails WCAG AA for tile labels

### Question
The Mind & Rest category's deep fill color doesn't provide sufficient
text contrast for tile labels at either white (3.57:1) or charcoal
(3.17:1) — both fail the 4.5:1 AA threshold. Should the category's token
color itself change, or should tile labels be dropped for this category,
or is a text-shadow/scrim mitigation sufficient long-term?

### Current behavior
A contrast-mitigation technique was applied as an immediate fix (see the
stabilization pass report for the specific approach and measured ratios,
documented in code). This is a stopgap, not a resolved design decision.

### Why it matters
Accessibility is a mandatory requirement, not optional polish — but the
real fix is a color-token decision, which is a design call, not something
engineering should decide unilaterally.

### Options
- Adjust the Mind & Rest deep token slightly to allow one contrast-safe
  text color (affects every other use of that token — card art, bars).
- Keep the mitigation technique (shadow/scrim) as the permanent solution.
- Drop tile labels for this category only (inconsistent with other tiles).

### Current temporary decision
Mitigation technique applied, ratios documented in code comments.

### Recommendation
Needs UI Designer's input — this is a token-level color decision, not a
pure bug fix.

### Priority
P1 — accessibility-adjacent, but not currently a hard failure since a
mitigation is in place.

---

## 5. Icon system is provisional (Lucide)

### Question
What icon set should the product actually use long-term?

### Current behavior
Lucide icons were adopted for this redesign as an interim, explicitly
provisional choice — CLAUDE.md bans emoji as primary interface icons, and
Lucide was judged the best available answer for now.

### Why it matters
You've indicated Deepthi (the end user) will provide her own icon
preferences at some point, which will likely mean another icon pass.

### Options
- Keep Lucide permanently if it turns out to suit the product.
- Replace with a custom icon set or illustration style once Deepthi's
  preferences are known.

### Current temporary decision
Lucide, used functionally and monochromatically throughout (not
illustrated/decorative), specifically so a later swap is a low-cost,
localized change.

### Recommendation
Revisit once Deepthi's input is available — no action needed before then.

### Priority
P2

---

## 6. GEOM / HOSS / HECOLL sub-picker

### Question
Should this card (the client's startup ventures, currently one flat card)
become a sub-picker for individual ventures?

### Current behavior
Unchanged — still a single flat card, carried over from the original
prototype. Not touched by this redesign.

### Why it matters
Carried forward from PRODUCT-HANDOFF.md §4.3/§9 — was already unresolved
before this redesign and remains so.

### Options
See PRODUCT-HANDOFF.md §4.3 for prior discussion.

### Current temporary decision
Unchanged.

### Recommendation
No new information from this redesign pass — still a standing question.

### Priority
P3

---

## 7. "Ritual Board" placeholder branding

### Question
Is "Ritual Board" (the sidebar brand name) acceptable as final branding,
or does the product have a different intended name?

### Current behavior
Unchanged — sidebar was explicitly frozen/out of scope for this redesign.

### Why it matters
Carried forward from PRODUCT-HANDOFF.md §3.1/§9 — unresolved before this
redesign, untouched by it.

### Options
Keep "Ritual Board," or replace with a decided final name/brand.

### Current temporary decision
Unchanged.

### Recommendation
No new information from this redesign pass.

### Priority
P3

---

## 8. Target platform (iOS / Android / PWA / web-only)

### Question
Is this a responsive web app only, or is a native/PWA build intended?

### Current behavior
Built as a responsive web app; no native/PWA packaging has been
attempted or discussed further in this redesign.

### Why it matters
Carried forward from PRODUCT-HANDOFF.md §9 — long-standing, unanswered.

### Options
Web-only, PWA, native iOS, native Android, or some combination.

### Current temporary decision
Web-only (responsive), unchanged.

### Recommendation
No new information from this redesign pass.

### Priority
P3

---

## 9. Taxonomy as a compile-time array vs. real content/API

### Question
The 24-card activity taxonomy lives as a hardcoded TypeScript array. Given
the client is expected to keep renaming/reorganizing this list (per
PRODUCT-HANDOFF.md §10), should it move to a real content source (API,
config file, CMS) sooner rather than later?

### Current behavior
Still a compile-time TS array (`app/src/data/activities.ts`) — a direct,
intentional carryover from the original prototype's approach, per this
redesign's explicit no-backend-changes constraint.

### Why it matters
Every taxonomy change currently requires a code change and redeploy.

### Options
Keep as code for now (fine at current scale); move to a config file
engineering can hand-edit without full app changes; move to a real
backend-driven source once persistence exists.

### Current temporary decision
Unchanged — compile-time array.

### Recommendation
Revisit once backend/persistence work begins — premature to solve in
isolation.

### Priority
P2

---

## 11. Activity tile label truncation

### Question
Most of the 24 activity tile names truncate to ambiguous fragments at every
breakpoint ("Cloth…", "Writin…", "Buildi…", "GEOM…") with no way for a
sighted user to recover the full name short of memorizing icon position
(the full name exists only in the `aria-label`, for screen readers). The
code already anticipates this as a pending decision, not a bug.

### Current behavior
Single-line truncate-with-ellipsis on every tile at every breakpoint.

### Why it matters
This is a legibility/discoverability question on the primary interaction
surface, but resolving it (wrapping to 2 lines, fewer columns, tooltips,
or shortening taxonomy names) changes visual/content decisions beyond a
pure bug fix.

### Options
Two-line wrap (shorter tiles, taller grid); fewer columns; a hover
tooltip on pointer-capable devices; shortening the taxonomy's longer
names as a content edit.

### Current temporary decision
Unchanged — truncation stays as-is pending design input.

### Recommendation
Needs UI/Product Designer sign-off.

### Priority
P2

---

## 12. Day/Night jump control's visual metaphor at wide breakpoints

### Question
The Day/Night control uses a segmented-control visual language (filled
vs. outlined pill) that reads as a mode switch, but it only ever jumps
the view — both rows stay fully visible always. On mobile this is fine
(the jump produces a real, visible scroll). On iPad landscape and
desktop, both rows already fit on screen with no scrolling needed, so
pressing the control changes which pill looks "active" but nothing else
visibly happens — which can read as broken to a first-time user.

### Current behavior
Functions correctly as designed; the perceptual gap is a feedback
problem, not a broken feature. Partially caused by a confirmed bug (the
`row-pulse` highlight animation that's supposed to confirm the jump has
no matching `@keyframes` in the built CSS, so it silently never fires) —
fixing that bug may substantially close this gap on its own.

### Why it matters
A control that visually implies mode-switching but produces no visible
effect erodes trust in the control, independent of whether the pulse
animation gets fixed.

### Options
(a) Strengthen the pulse/feedback so it's unmistakable even with no
scroll needed; (b) restyle away from the segmented-control metaphor at
wider breakpoints; (c) leave as-is once the pulse bug is fixed and
re-assess.

### Current temporary decision
Row-pulse bug fix is being applied as part of this stabilization pass;
re-assess whether the metaphor itself still needs a change afterward.

### Recommendation
Product/UI Designer call, best made after seeing the pulse-fix in place.

### Priority
P2

---

## 13. Avatar gradient consistency

### Question
The header avatar still uses its original gold→terracotta gradient, while
the redesign flattened all 24 activity-tile gradients to solid fills for
consistency. Should the avatar's gradient be flattened too?

### Current behavior
Unchanged — small, identity-mark-scale gradient, left alone as out of
scope during the UI Designer pass.

### Why it matters
Minor consistency question — everything else in the redesign moved away
from gradients as a matter of principle (per requirement #11's anti-
pattern list).

### Options
Flatten to a solid fill for full consistency, or leave as a deliberate,
small exception (identity marks are a common place gradients survive even
in otherwise-flat systems).

### Current temporary decision
Unchanged.

### Recommendation
Low-stakes either way — your call whenever convenient.

### Priority
P3
