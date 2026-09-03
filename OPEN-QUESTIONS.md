# Open Questions — mindful-me

Genuine unresolved product/design decisions. Nothing here should be treated as decided until someone actually decides it. This is current-state documentation, not a permanent list — items get resolved and removed, and new ones get added, as the product evolves. Implementation-level follow-ups (not product/design decisions) live in [`BACKLOG.md`](./BACKLOG.md) instead, to avoid two sources of truth.

---

## Resolved since the last pass

Kept here briefly so the resolution is traceable, not silently dropped.

- **Midnight rollover / multi-day state.** Resolved by the backend architecture work: storage moved to a real activity-centric model (real start time + duration, not a flat 48-slot array with no date), and the header date picker (`viewedDate` in `BoardContext`) makes "which day am I looking at" an explicit, first-class concept. An activity crossing midnight is one row, attributed to the day it started, with only its minutes split for aggregation.
- **Real weather data.** Resolved — real browser geolocation + Open-Meteo (temperature) + city-name lookup, with a graceful fallback chain, replaced the placeholder pill.
- **Activity-level flags.** Resolved as a side effect of the data model change — flags now attach to an individual scheduled activity by construction (there is no longer a "slot" for them to attach to instead), so the old ambiguity ("which of two activities in a slot does this flag mean?") no longer exists.
- **Day/Night jump control's visual metaphor.** Moot — the control itself was removed entirely as a later UX decision (it was found to be redundant, not just under-animated).
- **Mind & Rest category color failing WCAG AA for tile labels.** Resolved, for two independent reasons that both came out of the same visual-redesign work: (1) the 9-tile/53-item catalog re-measured every fill against the same 4.5:1 AA bar during the retone, and every one — tiles and items alike — cleared it with a lightness nudge alone (verified directly in `data/activities.ts`'s and `index.css`'s own contrast-methodology comments, not just asserted); `.label-contrast-boost` is defined but currently unused by anything. (2) Independently, tile backgrounds no longer use a per-category color at all — all 9 tiles now share one fixed, already-AA-checked accent (`--tile-accent` + white text), so a per-category contrast failure on a tile label isn't structurally possible any more. "Mind & Rest" itself was also superseded by the current 9-category taxonomy.

---

## 1. Icon system is provisional (Lucide)

### Question
What icon set should the product actually use long-term?

### Current behavior
Lucide, used functionally and monochromatically throughout — unchanged since it was first adopted.

### Why it matters
The end user was expected to eventually provide her own icon preferences, which would mean another pass.

### Recommendation
No new information since the last review. Revisit once/if that input arrives.

### Priority
P2

---

## 2. GEOM / HOSS / HECOLL sub-picker

### Question
Should this activity (a set of the end user's startup ventures, currently one flat card) become a sub-picker for individual ventures?

### Current behavior
Unchanged — still one flat activity card.

### Priority
P3

---

## 3. "Ritual Board" placeholder branding

### Question
Is "Ritual Board" (the sidebar and sign-in screen's brand name) acceptable as final branding, or does the product have a different intended name?

### Current behavior
Unchanged, and now appears in more places than before — the sidebar brand mark and the login/signup screen both show it.

### Priority
P3

---

## 4. Target platform (iOS / Android / PWA / web-only)

### Question
Is this a responsive web app only, or is a native/PWA build intended?

### Current behavior
Web-only (responsive), unchanged. Now backed by a real accounts system, which makes a future native app more straightforward than it would have been against the old anonymous/local-only model, if this is ever pursued.

### Priority
P3

---

## 5. Taxonomy as a compile-time array vs. a real content source

### Question
The 53-item taxonomy still lives as a hardcoded TypeScript array on the client. The backend work added a matching `activities` catalog table in the database (kept in sync with that same array, to satisfy the schema's foreign key), but the frontend picker does not read from it — should it?

### Current behavior
Two copies of the taxonomy now exist: the compile-time array the UI actually uses, and a DB table it doesn't consume dynamically. Every taxonomy change still requires a code change and redeploy. (Verified again this pass: the client's only use of `public.activities` is `catalogIdForName`, a name→id lookup for the sync foreign key — it never reads category, icon, color, or any other rendering-relevant column from the table.)

### Why it matters
This taxonomy has already been renamed/reorganized multiple times (twice more since this question was first raised) and is expected to keep changing.

### Options
Keep as-is (fine at current scale, but now genuinely two sources of the same data); make the DB catalog the actual source of truth the client fetches from; or a config file short of a full backend-driven source.

### Recommendation
Worth resolving now that a real backend exists to make this easy, rather than continuing to carry two copies.

### Priority
P2

---

## 6. Activity tile label truncation

### Question
Most activity tile names still truncate to ambiguous fragments visually (the full name exists only in the accessible label). Should this change?

### Current behavior
Unchanged single-line truncate-with-ellipsis.

### Priority
P2

---

## 7. Avatar / account menu visual treatment

### Question
The header avatar's gradient fill was left as a deliberate small exception when the rest of the product flattened to solid category fills. The avatar has since become functional (a real account menu with sign-out, not just a decorative mark) — does its visual treatment still make sense now that it does something?

### Current behavior
Unchanged gradient fill, now attached to real functionality.

### Priority
P3

---

## 8. Sign-in method — is email/password the permanent answer?

### Question
Real accounts currently support email/password only, with no email verification (a deliberate choice for now). Is a magic link or an OAuth provider (Google, etc.) wanted later, and should email verification be reconsidered once the user base is larger than "one person testing it"?

### Current behavior
Email/password, no verification.

### Why it matters
No email verification means anyone can sign up with an email address they don't own — an accepted trade for a single-person app, worth revisiting before this is used by more than one person.

### Priority
P2

---

## 9. "Slow down"'s disappear rule was a judgment call, not a spec answer

### Question
The source spec gave no explicit auto/manual disappear rule for the "Slow down" item (Sleep & Rest tile) the way it did for its column-mates. It currently defaults to `manual` (dismiss-only, never auto-locks after N times today) — is that the right permanent behavior, or should it be `auto:N` for some N like its neighbors?

### Current behavior
`disappear: { mode: 'manual' }` in `data/activities.ts`, called out in-line as a defaulted assumption, not a confirmed answer.

### Why it matters
Was previously only flagged in a PR description, not tracked anywhere that survives past that PR merging — recorded here so the assumption doesn't quietly become the permanent, unquestioned answer just because nobody revisited it.

### Priority
P3
