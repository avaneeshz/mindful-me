# mindful-me

A personal time and activity tracking application — a visual, day-and-night timeline for planning and logging how you actually spend your time, built as a real product rather than a prototype: a React client backed by a Postgres database (Supabase), with real accounts and local-first sync.

## What it is

Your whole day, as two rows — Day (6a–6p) and Night (6p–6a) — with activities placed on a real timeline rather than a flat to-do list. Every activity carries an arbitrary duration (8 minutes, 37 minutes, 2 hours — never rounded to fit a grid), belongs to one of nine wellness categories (Sleep & Rest, Food & Nourishment, Personal Care, Downtime & Errands, Movement & Body Therapy, Work & Projects, Nature & Spirit, Growth & Connection, Home & Chores), and can optionally carry an emotional/somatic flag (Trauma response, Stress response, Fear response, Anger response) — encrypted at rest, visible only to you.

Two ways to schedule something — dragging an activity onto the timeline, or selecting a slot and picking an activity — go through the exact same underlying logic, so they can never drift into two different sets of rules.

## Current state

Implemented and running: real email/password accounts, a Postgres backend with row-level security, local-first writes (every change saves instantly to the device and syncs in the background — the app never waits on the network), a real date picker for any past or future day, and real weather + city-based location.

See [`BACKLOG.md`](./BACKLOG.md) for exactly what's shipped, what's mid-flight, and what's next — it's kept current and is the fastest way to get oriented.

## Running it locally

```bash
npm install
npm run dev          # starts the Vite dev server
npm test              # runs the test suite (vitest)
npm run typecheck      # tsc, no emit
npm run build          # production build
```

The app runs fully offline/local-only with zero setup — no backend required to explore the timeline. To connect it to a real Supabase project, copy `app/.env.example` to `app/.env` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable/anon key — safe to be public; every real permission boundary is enforced by row-level security on the database, not by keeping this key secret).

## Documentation map

| File | What it's for |
|---|---|
| [`PRODUCT.md`](./PRODUCT.md) | What this product is, who it's for, and why it's built this way |
| [`FEATURES.md`](./FEATURES.md) | What's actually built and working today |
| [`ROADMAP.md`](./ROADMAP.md) | Where the product has been and what's genuinely being considered next |
| [`UX.md`](./UX.md) | The interaction model — how scheduling, editing, and navigation actually work |
| [`UI-DESIGN.md`](./UI-DESIGN.md) | The visual design system as built |
| [`BACKLOG.md`](./BACKLOG.md) | The current priority and everything confirmed-but-deferred — the living source of truth for "what's next" |
| [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) | Genuinely unresolved product/design decisions |
| [`PRODUCT-HANDOFF.md`](./PRODUCT-HANDOFF.md) | Historical: the original prototype's full spec, superseded by the above but preserved for context |
| [`CLAUDE.md`](./CLAUDE.md) | Engineering constitution — product philosophy, design system rules, and the architecture/rules the project's engineering agent works against |

## Stack

React 19 + TypeScript + Vite, Tailwind CSS + shadcn/ui-style components + Radix primitives, Lucide icons. Backend: Supabase (Postgres, row-level security, real-time-capable, email/password auth). Deployed on Vercel.
