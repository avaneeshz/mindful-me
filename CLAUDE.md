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

## Agent Workflow

There is a single agent for this project: **full-stack-engineer** (`.claude/agents/full-stack-engineer.md`). It owns frontend, backend, and database work end-to-end — there is no separate design, QA, or review agent.

Product philosophy, the design system, and every rule in this file still apply in full to everything that agent builds — a single implementer does not mean lighter standards. The agent's own file carries the project-specific architecture, the decided backend/database model, and the non-negotiable product rules for scheduling; read it alongside this file before implementing anything substantial.

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
