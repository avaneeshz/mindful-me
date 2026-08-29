# Roadmap — mindful-me

## How to read this

The **history** below is factual — what was actually built, in order. The **ahead** section is deliberately conservative: only things already confirmed as real requirements go here as committed; everything else is named as a candidate, not a promise. For the single current source of truth on what's active right now, see [`BACKLOG.md`](./BACKLOG.md) — this file is the narrative version, that one is the living checklist.

## History

**Prototype era.** A whiteboard-inspired, single-file HTML/CSS/JS prototype — 48 fixed 30-minute slots, no backend, no persistence, in-memory only. Fully documented in [`PRODUCT-HANDOFF.md`](./PRODUCT-HANDOFF.md) (historical; superseded by everything below).

**React rebuild + stabilization.** Ported to React + TypeScript + Vite, the current design system adopted (Tailwind, shadcn/ui-style components, Radix, Lucide, Recharts), drag-and-drop added, a stabilization pass fixing accessibility and responsive issues from the port.

**Backend architecture (Phases 1–3).** The 30-minute slot was made a purely visual grid: storage moved from slot-index-keyed entries to activity-centric rows (real start time + arbitrary duration). A real Supabase backend was stood up — three tables (`activities`, `scheduled_activities`, `activity_events`), row-level security, a database-level no-overlap constraint, encrypted sensitive flags, local-first writes. Completion tracking and an append-only audit trail landed alongside it.

**UI/UX enhancement round.** Sidebar collapsed by default; the duration control's drift bug fixed and its step size changed; the redundant Day/Night toggle removed; the hour ruler simplified to three labels per row; an illustrated Day/Night timeline scene added, with the active period's sun/moon glowing.

**Real accounts.** Anonymous auth replaced with real email/password sign-in (no email verification, a deliberate choice) — the same account now sees the same data on every device, once the backend is actually connected.

**Further UI/UX round (BL-1/2/3).** The two separate duration controls merged into one click-to-edit stepper; the header date pill became a real date picker for any past/future day; the weather pill became real (device location + Open-Meteo temperature + city-only display, with a provider swap after a live check found the first IP-location choice unreliable).

## Ahead

**In progress, not yet merged** — see `BACKLOG.md` for current status: an Insights/analytics screen and stronger offline sync resilience both have a first-pass implementation on a branch, held back deliberately while the requirement gets more clearly defined (expect more UI work here before either merges).

**Named gaps, not yet confirmed as requirements** — real, honest absences relative to comparable products, worth deciding on deliberately rather than assuming:
- Recurring/repeating activities.
- External calendar sync (Google/Apple Calendar).
- Reminders and notifications.
- A native mobile app (the product is a responsive web app today).
- AI-assisted scheduling (a deliberate product-philosophy question, not just an engineering one — mindful-me is built around the user staying in full manual control of their own schedule).

Nothing in this section is committed. Raise it explicitly before it gets built.
