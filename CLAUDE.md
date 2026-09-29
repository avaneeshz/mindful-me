# mindful-me — Project Constitution

## Product

mindful-me is a premium personal life-tracking application.

The application helps the user understand how they spend their time, what activities they perform, how consistently they perform them, and how their life patterns evolve over time.

The product should feel like a polished commercial consumer product, not an internal admin dashboard or an AI-generated prototype.

## Product Philosophy

Prioritize:

1. Clarity
2. Simplicity
3. Personal usefulness
4. Low cognitive load
5. Fast interaction
6. Beautiful but restrained visual design
7. Meaningful insights
8. Consistency

Do not add complexity merely because a feature is technically possible.

## Frontend Design System

The frontend must use one coherent design system.

Preferred foundation:

* shadcn/ui
* Tailwind CSS
* Radix UI primitives
* Lucide icons
* Recharts for charts
* Motion for purposeful animation

Do not introduce another UI framework without explicit approval.

## Visual Direction

The visual quality should be comparable to excellent modern products such as:

* Linear
* Notion
* Apple Health
* premium productivity applications
* polished modern SaaS products

The application must NOT look like:

* a generic Bootstrap dashboard
* an admin panel
* an AI-generated template
* a collection of unrelated UI components

## Design Principles

Use:

* strong visual hierarchy
* restrained colors
* consistent spacing
* consistent typography
* semantic color tokens
* accessible contrast
* subtle borders
* subtle shadows
* purposeful animation
* responsive layouts

Avoid:

* excessive gradients
* excessive glassmorphism
* excessive shadows
* excessive rounded cards
* random colors
* unnecessary animations
* emoji as primary interface icons
* inconsistent spacing
* one-off component designs

## Component Rule

Before creating a new component:

1. Search the existing component library.
2. Determine whether an existing component can be reused.
3. Extend an existing component when appropriate.
4. Create a new component only when the interaction pattern is genuinely new.

Never create visually duplicated components.

## UX States

Every meaningful user interaction must consider:

* loading
* empty
* error
* success
* disabled
* hover
* focus
* active
* mobile/responsive behavior

## Responsive Design

The product must work well on:

* desktop
* tablet
* mobile

Do not merely shrink desktop layouts on mobile.

Adapt information hierarchy and interactions appropriately.

## Product Logic

Business requirements and API contracts are authoritative.

Do not modify API contracts, payloads or business behavior merely to simplify frontend implementation.

## Platform Portability (future iOS & Android)

mindful-me is a web application today. Native iOS and Android apps are not being built yet, but every change must keep that option cheap. The rule is to **keep the logic ("brain") separate from the screens ("face")**: logic and data code carry over to a future React Native / Expo app, and screens get rebuilt.

1. **Three layers, one direction.** `domain/` (pure TypeScript rules and calculations) ← `data` (`api/`, `state/` hooks, local stores) ← UI (`components/`, `routes/`, screen files). UI components never call `api/*` functions or the Supabase client directly. They go through a hook. `domain/` never imports React, `window`, `document`, `navigator` or any storage.
2. **Browser-only APIs live behind one small adapter each**: storage, OAuth/navigation redirects, file export/share, geolocation, notifications, theme/DOM attributes, environment config. New code never uses `localStorage`, `window.location` or `import.meta.env` outside its adapter.
3. **New product modules are self-contained** (gardening, healthcare, baby care, food and so on): `app/src/modules/<name>/` with `domain/`, `data/`, `ui/` and one public `index.ts`, plus their own migrations and row-level security. Modules talk to each other only through `index.ts`. Shared concepts (user, day, time zone, activity) live in the shared core, never copied. Each module can be switched off with a feature flag.
4. **The backend is the source of truth for rules.** Anything that must always hold (ownership, validation, limits, no-overlap) is enforced in Postgres or an edge function, not only in React.
5. **Every drag or hover interaction has a tap equivalent.** Never put information only in a hover state.
6. **Times are stored in UTC plus the user's IANA time zone.** Sensitive health, baby-care and personal data is marked and protected as such from day one.
7. **Don't build for mobile yet.** No React Native, Capacitor, Expo or monorepo until a native app is an approved requirement. Never make the web experience worse to "look native".

Known existing gaps against these rules are tracked in `MOBILE-READINESS.md`. Don't add new ones. When you touch a file listed there, fix its entry if the fix is small and in scope.

## Agent Workflow

There is a single agent for this project: **full-stack-engineer** (`.claude/agents/full-stack-engineer.md`). It owns frontend, backend, and database work end-to-end — there is no separate design, QA, or review agent.

Product philosophy, the design system, and every rule in this file still apply in full to everything that agent builds — a single implementer does not mean lighter standards. The agent's own file carries the project-specific architecture, the decided backend/database model, and the non-negotiable product rules for scheduling; read it alongside this file before implementing anything substantial.

## Git & Deployment Workflow

**Read `WORKFLOW.md` before cutting a branch, opening a PR, or merging anything.** It is not optional background reading — it is the required process: feature branches are cut from `develop` (never `main`), tested against the test Supabase project, merged to `develop` first, and only promoted to `main` through the ordered release steps it lays out (schema migrated before code, expand-contract for destructive changes, PR review, no direct push to `main`). There is no direct merge to `main` outside the single emergency exception `WORKFLOW.md` names.

## Quality Standard

The final result should be something that could plausibly be shipped as a polished consumer product.

When uncertain, prefer:

* simpler
* clearer
* more consistent
* less decorative
* more intentional

over:

* more features
* more visual effects
* more components
* more complexity
