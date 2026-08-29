# Daily Ritual Board — Engineering Handoff

> ## ⚠ Status: historical — superseded
>
> This document specifies the **original single-file HTML/CSS/JS prototype** — no backend, no persistence, no accounts, a fixed 48-slot-per-day data model with no date attached. **None of that describes the current product.** The prototype was rebuilt in React + TypeScript, and now runs on a real Postgres backend (Supabase) with real accounts, activity-centric storage (arbitrary duration, real timestamps, not 48 fixed slots), row-level security, and offline-resilient sync.
>
> For current, accurate information, use:
> - [`README.md`](./README.md) — start here
> - [`PRODUCT.md`](./PRODUCT.md), [`FEATURES.md`](./FEATURES.md), [`UX.md`](./UX.md), [`UI-DESIGN.md`](./UI-DESIGN.md) — current product/design docs
> - [`BACKLOG.md`](./BACKLOG.md) — what's shipped, what's next
> - [`.claude/agents/full-stack-engineer.md`](./.claude/agents/full-stack-engineer.md) — the current architecture and its non-negotiable rules
>
> Everything below is preserved as **historical record** — original client intent, the design-language evolution, and the activity taxonomy's rationale are still genuinely useful context. Don't treat any technical/architectural claim below (data model, "no backend," slot mechanics) as current fact.

**Daily Ritual Board**  
Engineering & Product Handoff Document

*Prepared for: incoming engineering team (Claude Code handoff) | Source: HTML/CSS/JS interactive prototype + design conversation log*

**This document is a complete, standalone specification of the Daily Ritual Board product as it existed in the original interactive HTML prototype.** It captures every product, UX, UI, and functional decision made across that phase of the design conversation, cross-referenced against the prototype code as it was at the time — not just what was discussed, but what was actually built, *then*. It is kept for historical traceability, not as current guidance — see the status note above.

---

## 1. Product Overview

### 1.1 What this product is

A visual, whiteboard-inspired daily ritual planner built for a specific named end user (referred to throughout as "Deepthi" / "Dipti" in early conversation — confirmed correct spelling is Deepthi). The product owner (referred to as "Avaneesh") is building this as a client-style engagement: Deepthi is the end user and the source of UX requirements; Avaneesh is the product owner directing design.

The core mental model: Deepthi keeps a physical whiteboard at home with magnetic activity tiles that she manually arranges into time slots each day. This product is a digital, delight-focused re-creation of that ritual — explicitly **NOT** a data-logging or analytics tool.

### 1.2 Product goals (as stated by the client)

- Give Deepthi a digital equivalent of her physical whiteboard-and-magnets planning ritual.
- Make opening the app something she looks forward to, not a chore — the interface's visual appeal **IS** the product's core value proposition.
- Let her pick an activity from a structured list and place it into an open time slot, specifying duration.
- Show a clear, glanceable record of what she has already done today without overwhelming the screen.
- Reduce cognitive load, create orientation ("where am I in the day"), make the passage of the day visually easy and exciting.

### 1.3 Explicit non-goals (current phase)

- No backend database or persistence — the current prototype is front-end only; all state lives in an in-memory JS object and resets on page reload.
- No scoring/points system in the traditional sense — the "Today's Shape" score ring is a completion percentage (slots filled ÷ 48), **NOT** a quality or behavior score. This is a deliberate distinction from a separate, unrelated project ("LifeLog") that **DOES** use a weighted scoring system — the two products must not be conflated.
- No login/auth system in the current prototype.
- No multi-user support.
- The six "Inner State" concepts (Thoughts, Emotions, Reactivity, Trauma response, Stress response, Fear response) were originally proposed as full activities but were resolved down to just three (Trauma/Stress/Fear) implemented as "Flags" — see §4.2.

---

## 2. Design Language Evolution — Read Before Making Visual Changes

*The visual direction changed twice over the course of this project. This history matters because it explains why certain older reference material (if found in project archives) should NOT be used as current guidance.*

### Phase 1 — "Calm command centre" (superseded)

Original client brief called for an extremely low-saturation, muted palette:

- Deep Forest `#173F3A` (primary)
- Sage `#7D9B8A` (secondary)
- Warm Ivory `#F7F4EC` (mapped specifically to Sports or Exercise)
- Muted Sand `#E8E1D3`
- Terracotta `#B86F5B` (alerts/patterns only)
- Soft Gold `#C6A96B` ("significant insights" only)
- Charcoal `#252A28` (text)

The instruction was explicit: colors are functional/reserved, not decorative, and each named color maps to a specific role — this is **NOT** a free 7-color decorative palette.

**DECISION LOG** — This phase's constraint — that named colors are reserved for specific functional roles rather than freely reused — carried forward into Phase 2 and should still be respected even though the specific hex values changed.

### Phase 2 — "Industry-grade / editorial" (current, active direction)

The client provided a screenshot reference of a polished wellness-app dashboard (photographic card imagery, sidebar app-shell, warm editorial tone, circular progress score) and asked to match that production quality. The team explicitly approved abandoning the low-saturation direction in favor of this warmer, more colorful style. **THIS** is the current, live direction — see §5 for the full current color system.

**OPEN** — No image-generation tool was available during this build. All "photographic-style" card art in the current prototype is CSS gradient + emoji icon, not real photography. If true photographic card art is still desired, the incoming team needs either a licensed stock photo pipeline or an image-generation tool connected to their environment.

---

## 3. Information Architecture & Navigation

### 3.1 App shell

- Left sidebar: brand mark + name ("Ritual Board" — placeholder branding, not client-confirmed final name), 7-item nav list (Today [active], My slots, Activity Library, Progress, Insights, Flags, Settings), and a "Stay Consistent" footer CTA card.
- Only "Today" is implemented. My Slots, Activity Library, Progress, Insights, Flags, and Settings are nav placeholders with no built screens — clicking them currently does nothing.
- Sidebar has a repeated decorative leaf/plant motif (3 low-opacity leaf emoji at different rotations/sizes) per client request to echo a "MindfulMe"-style reference screenshot.

### 3.2 Header (top bar)

- Greeting: "Good Afternoon, {name} 👋" + a live status line ("14 of 48 slots placed today · You're on a 6-day streak"). The streak counter is **HARD-CODED** at 6 — there is no streak-calculation logic implemented.
- Right-aligned cluster, all elements fixed at 52px height and vertically centered against the greeting (this alignment was a specific client fix — see §7 changelog): date pill, weather pill (temperature + location, currently hard-coded "28°C / Hyderabad"), notification bell with a badge count (hard-coded "3"), and a profile avatar (person-icon glyph, not a photo — see Phase 2 note above) with a dropdown chevron.

### 3.3 Main content — single screen ("Today")

Three-panel structure on desktop/tablet:

- Left/main column: "24-Hour Ritual Flow" strip card, then "Right Now" (activity picker / slot editor) card.
- Right column: "Today's Shape" (score ring + category breakdown) card, then "Recent Activity" card.
- On mobile (≤768px), all panels stack vertically in a specific client-mandated order: Right Now (edit slot) → Today's Shape → Recent Activity. Sidebar is hidden entirely on mobile. See §6 for full responsive spec.

---

## 4. Core Data Model & Terminology

*Terminology is significant and should be used consistently in code, copy, and future specs — the client corrected several terms during the conversation.*

### 4.1 Canonical terms

| Term | Definition |
|------|------------|
| **Slot** | One 30-minute unit of the day. 48 slots total per day (confirmed final; 24×60-min was considered and rejected). |
| **Card** | A top-level, draggable/tappable activity (e.g. "Nature connect"). 24 cards total — **NOT** 25; "Journaling" was removed and "Miscellaneous" was added as a replacement to keep the count at 24, arranged as a 6-column × 4-row grid. |
| **Sub-option / Sub-picker** | A second-level choice inside a card that has one (e.g. Nature connect → Sunlight/Breathwork/Star sleeping). Rendered as pill chips, not cards. |
| **Third level** | Only one card ("Body care") goes three levels deep: Body care → Massage/Oiling/Mask → Face/Body/Hair. |
| **Flag** | **NOT** a timed activity. A marker (Trauma response / Stress response / Fear response) that attaches to a slot in addition to whatever activity is placed there. Rendered as 3 small icon-emoji buttons, never as a duration-bearing card. |
| **Multi-activity slot** | A single 30-minute slot may contain up to 2 activities whose durations sum to ≤30 minutes (e.g. 15 min Body care + 15 min Supplements in one slot). |
| **"Right Now" panel** | The card used to view/edit whichever slot is currently selected — despite the name, it is also used to edit past or future slots (via clicking any slot on the strip). |

### 4.2 Flags — special-cased entity

Flags deserve their own subsection because they break the standard activity pattern and were a repeated source of clarification during the build:

- Represent three of the six originally-proposed "Inner State" tags. The other three (Thoughts, Emotions, Reactivity) were dropped — not built, not represented anywhere in the current prototype.
- Rendered as three small square icon buttons (💔 Trauma, 😰 Stress, 😨 Fear) in the top-right of the "Right Now" card header.
- A slot can carry all 3 flags simultaneously.
- Flags render directly inside their slot's colored segment on the 24-hour strip, stacked vertically (top/middle/bottom) rather than side-by-side — this was a specific bug fix; the original horizontal layout caused flag icons to visually bleed into neighboring slots.
- Flags have no duration control and do not consume slot capacity (a slot can be flagged even if its 30 minutes are otherwise fully booked by 2 activities).

**OPEN** — Flags currently apply to the whole slot, not to a specific one of the two possible activities within that slot. If a slot has both "Body care" and "Supplements" logged, a flag can't indicate which one it's about. This was identified as an open question and never resolved with the client.

### 4.3 Full 24-card taxonomy

This is the authoritative list, extracted directly from the prototype's data array, in on-screen order (left-to-right, top-to-bottom in the 6×4 grid). Category assignments below drive both card art color and the "Today's Shape" breakdown.

| Card | Category | Sub-options | Notes |
|------|----------|-------------|-------|
| Flags | — | Trauma response, Stress response, Fear response | Special: no duration, attaches to a slot as a marker, not a timed activity |
| Night Sleep | Mind & Rest | — | |
| Day Sleep | Mind & Rest | — | |
| Brushing + Shower | Body & Domestic | — | |
| Clothes maintenance | Body & Domestic | — | |
| Writing — author journey | Focus & Growth | — | |
| Image generation | Focus & Growth | — | |
| Homework | Focus & Growth | — | |
| Meal Prep | Body & Domestic | — | |
| Nursery visit | Body & Domestic | — | |
| Star Bazar visit | Body & Domestic | — | |
| Vipassana | Mind & Rest | — | |
| Nature connect | Nature & Connection | Sunlight, Breathwork, Star sleeping | |
| Sports or Exercise | Sports or Exercise | Dance, Skipping, Running, HIIT, Suryanamaskar, Moonnamaskar | Own category per client color brief |
| YouTube watching | Mind & Rest | — | |
| Human connection | Nature & Connection | — | |
| GEOM / HOSS / HECOLL | Focus & Growth | — | Client's startup ventures; treated as one card for now |
| Spiritual Care | Nature & Connection | Singing time/worship time, Bible reading, Prayer | |
| Building & Rebuilding | Focus & Growth | Podcasts, Audiobook | |
| Errand time | Body & Domestic | — | |
| Pomodoro Break | Mind & Rest | Eating leaves, CCTV Control Station, Stretching, Humor content | |
| Body care | Body & Domestic | Massage / Oiling / Mask | 3-level: each of the 3 opens Face / Body / Hair |
| Supplements | Mind & Rest | Omega, Magnesium, Zinc | |
| Gmeet / Zoom | Focus & Growth | Coach, Therapist, Cofounder, Personal Board of Director | |
| Miscellaneous | Body & Domestic | — | Added to round the grid to 24 |

#### Unresolved / ambiguous source items — carried as open notes

**OPEN** — "GEOM / HOSS / HECOLL" — confirmed by the client to be names of startup ventures, but treated as a single flat card. If per-venture logging is ever needed, this becomes a sub-picker.

**OPEN** — "CCTV Control Station" and "Eating leaves" — client confirmed these are simply break-type sub-options under Pomodoro Break; their literal real-world meaning was explicitly said not to matter for design purposes.

**OPEN** — "Building & Rebuilding" — client confirmed Podcasts and Audiobook are its two sub-items; broader scope (project work vs. general activity) was never fully clarified beyond that.

---

## 5. Current Visual Design System (Phase 2)

### 5.1 Color tokens

| Token | Hex | Functional role |
|-------|-----|-----------------|
| Deep Forest | `#1B3B32` | Primary — sidebar background, headings, primary buttons, high score band |
| Sage / muted variants | `#6B8F82` family | Secondary — Mind & Rest category, muted UI text |
| Warm Ivory / off-white | `#F7F5F0` (bg), `#FFFFFF` (cards) | Page background and card surfaces |
| Terracotta | `#E8845C` | Alerts / flags / Sports or Exercise category / low score band |
| Soft Gold | `#D4A857` | Significant insights — "Add another activity" prompts, mid score band |
| Charcoal | `#3D3A35` | Body text |

#### Category color pairs (deep / light) + icons

Two color intensities exist per category: a deeper tone used for card art backgrounds and legend/bar fills, and a light pastel tone used specifically for the 24-hour strip fill (the strip was deliberately made lighter than card art per client request, to read as "soft" like the reference screenshot).

| Category | Deep (cards/bars) | Light (strip only) | Icon |
|----------|-------------------|--------------------|------|
| Mind & Rest | `#6B8F82` | `#BFD9C9` | 🌙 |
| Body & Domestic | `#C9B48A` | `#EDDFC0` | 🏠 |
| Sports or Exercise | `#E8845C` | `#F5C7AE` | 🏃 |
| Nature & Connection | `#4F7D6C` | `#CFE3C2` | 🌿 |
| Focus & Growth | `#1B3B32` | `#C7D6D8` | 🎯 |

### 5.2 Typography

- **Display/headline font:** Fraunces (serif) — used for greeting, card titles, score number, time ranges.
- **Body/UI font:** Inter (sans-serif) — used for everything else.

### 5.3 "Today's Shape" score ring — banded color logic

The ring is a simple completion percentage (filled slots ÷ 48 × 100), **NOT** a weighted quality score. Color and status label are banded:

| Score range | Status label | Ring / fill / label colors |
|-------------|--------------|----------------------------|
| 80–100 | Excellent | `#3E9B5C` (ring) / `#E7F5EA` (fill) / `#2E7A47` (label) |
| 60–79 | Good | `#C6A857` / `#FBF3DF` / `#96792F` |
| 40–59 | Building | `#E0904A` / `#FCECDC` / `#B06A28` |
| 0–39 | Just started | `#D2604A` / `#FBE3DC` / `#A8442F` |

**DECISION LOG** — The ring's fill (the soft tint behind the stroke) changes with the band — this exact behavior (light-color fill for a high score) was a specific, explicit client request modeled after their reference screenshot.

**OPEN** — The "▲ vs yesterday" trend indicator next to the score is static copy — there is no actual "yesterday" data being stored or compared. This is a known placeholder, not a working feature.

---

## 6. Interaction Design & Functionality

### 6.1 Primary flow — logging an activity

1. User taps any slot on the 24-hour strip (or the strip auto-selects "now" on load).
2. "Right Now" panel shows that slot's time range and, if it already has activities, an "IN THIS SLOT" list with Remove buttons for each.
3. User taps a card from the 24-card grid below.
4. If the card has sub-options, a breadcrumb ("← back / Card name / [sub-option]") appears and the grid is replaced by pill-style sub-choices — recursing one more level for Body care.
5. A duration stepper (15-min increments, min 15, capped at whatever's left in the slot — max 30 for a single activity, or less if another activity already occupies part of the slot) appears once a leaf-level choice is made.
6. "Add to this slot" / "Update this slot" commits the entry. The slot on the strip updates immediately; if it now holds 2 activities, the segment visually splits proportionally by each activity's duration.

### 6.2 Drag-and-drop (added late in the build)

- Every card in the grid is HTML5-draggable. Dragging over a strip segment highlights it with a gold outline as a drop-target indicator.
- Dropping a card with **NO** sub-options adds it directly to that slot at a default duration (whatever's left in the slot, capped at 30) — no further taps required.
- Dropping a card **WITH** sub-options selects that slot and opens its sub-picker instead of guessing a sub-choice — the system deliberately does not auto-select a sub-option or duration on drop.
- If the target slot is already at capacity (2 activities / 30 min), the drop simply opens that slot's (full) edit view rather than silently failing or erroring.
- Click-to-select-then-tap-card remains fully functional in parallel — drag-and-drop is additive, not a replacement interaction.

### 6.3 Slot editing rules

- Any past, present, or future slot can be opened for editing by clicking it directly on the strip — there is no separate "jump to slot" control (a "Jump to now" button existed earlier in the build and was explicitly removed at client request).
- A slot holds 0, 1, or 2 activities. Total duration across activities in one slot cannot exceed 30 minutes; the duration stepper enforces this by capping at the remaining minutes.
- Individual activities within a slot can be removed independently via a "Remove" link next to each entry in the "IN THIS SLOT" list.

### 6.4 "Today's Shape" panel behavior

- Score ring: completion percentage as described in §5.3.
- Category breakdown: 5 rows (Mind & Rest, Body & Domestic, Sports or Exercise, Nature & Connection, Focus & Growth), each showing total time logged and a proportional bar (scaled against whichever category currently has the most minutes, minimum scale of 60 min).
- Each category row uses a small tinted icon square instead of a plain color dot (client-requested change from an earlier dot-only version).

### 6.5 "Recent Activity" panel behavior

- Shows the 3 most recently-logged slots (by slot index, descending), each with its icon, name (+N suffix if a second activity is also in that slot), time, and duration.
- If that slot carries a flag, the flag emoji renders as a small badge on the right of the row.

**DECISION LOG** — This panel replaced an earlier "Flagged Moments" panel (which listed only flagged slots) at client request — flag visibility was preserved as a secondary badge on Recent Activity rather than dropped.

---

## 7. Responsive Behavior

### 7.1 Breakpoint strategy

**IMPORTANT** — read this before modifying layout CSS. An earlier attempt to add tablet-range responsive behavior (a breakpoint around 1100px that collapsed the sidebar to icon-only and reflowed the right rail) was explicitly rejected by the client as looking broken in ordinary desktop browser windows, and was fully reverted. The lesson embedded in that revert: do not add intermediate breakpoints between desktop and true mobile widths. The current, approved strategy is exactly two states:

- **Desktop / tablet / iPad landscape (>768px):** a single fixed 3-column shell (fluid/percentage-based internally, so it scales smoothly down to ~1000px without any breakpoint logic) — full sidebar with labels, 3-panel layout, no structural changes at any width down to 768px.
- **Mobile (≤768px):** ONE breakpoint. Sidebar is hidden entirely (`display:none` — not collapsed to icons). All three main panels stack vertically in the fixed order: Right Now → Today's Shape → Recent Activity. Card grid drops from 6 columns to 4. Header wraps. Strip, score ring, and type scale down proportionally.

**DECISION LOG** — This two-state strategy (full desktop layout unchanged down to 768px, then one clean jump to a stacked mobile layout) is a direct, deliberate response to client feedback and should be treated as a hard constraint, not just a starting point, until the client says otherwise.

### 7.2 Verified viewport sizes

- **Desktop:** 1600×1000 — full layout, confirmed against client-approved screenshots.
- **iPad landscape:** 1194×834 — the client's actual target device; full layout renders correctly with zero vertical scroll (verified via direct DOM overflow checks, not just visual inspection).
- **Mobile:** 390×844 — stacked layout, sidebar hidden, verified interactive (card tap, drill-down, duration stepper all functional at this width).

**OPEN** — No breakpoint or layout testing has been done between 768px and 1100px beyond confirming it does **NOT** trigger the old (reverted) tablet layout. This range inherits the desktop layout, scaled fluidly — it has not been separately reviewed by the client.

---

## 8. Adjacent Project — Do Not Confuse

A separate, unrelated product ("LifeLog") was referenced multiple times in the source conversation as the origin point for this project's initial inspiration, and the two should not be conflated by an incoming team:

- LifeLog is a personal daily life-logging PWA with a three-score weighted scoring system (Score A/B/C), tracking habits, substance use, nutrition, and intimacy — built on React + Supabase + Vercel.
- Daily Ritual Board (this product) intentionally has **NO** scoring system in that sense — its "score ring" is a simple completion percentage, explicitly not a weighted behavioral score.
- The two products share no code, no data model, and no backend. Any future integration between them has not been discussed or planned.

---

## 9. Consolidated Open Questions & Unresolved Decisions

*Every item below was raised during the design process and left unresolved. An incoming team should get explicit answers before building further on top of the affected area.*

- Whether flags should be attachable to a specific activity within a multi-activity slot, rather than the whole slot (§4.2).
- Whether "GEOM / HOSS / HECOLL" should eventually become a sub-picker of individual ventures (§4.3).
- Whether real photographic card art is required, and if so, what image source/licensing/generation pipeline will supply it (§2, Phase 2 note).
- Whether the "▲ vs yesterday" trend indicator should become real, and if so, how "yesterday" is computed and persisted (§5.3).
- Whether the streak counter ("6-day streak") should become real, and how a streak is defined (e.g. minimum slots filled per day) — currently hard-coded.
- Target platform confirmation: iOS, Android, or both, for an eventual native/PWA build — this was raised early in the project and never definitively answered.
- Whether "Ritual Board" is an acceptable placeholder app name, or whether the client has a preferred final name/brand.
- No backend, persistence, or auth strategy has been discussed at all — the current prototype's data model (a single in-memory JS object keyed by slot index) is a reasonable starting point for schema design but has not been reviewed for that purpose.

---

## 10. Suggested Next Steps for Engineering

- Treat the current HTML file as the canonical UI/UX reference for pixel-level behavior, spacing, and interaction timing — many small details (duration capping logic, drop-target highlighting, flag stacking direction) are easier to read from the working JS than to re-derive from this document alone.
- Before writing a component architecture, resolve the open questions in §9 that touch data modeling (flags-per-activity, streak logic, yesterday-comparison) since they affect schema decisions early.
- Preserve the responsive constraint in §7.1 exactly — it reflects a real, explicit client correction, not just an implementation default.
- The 24-card taxonomy in §4.3 should be treated as content data, not hardcoded UI — the client has already renamed/reorganized this list multiple times during design and should be expected to keep iterating on it.