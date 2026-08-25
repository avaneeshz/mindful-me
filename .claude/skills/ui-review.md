---

name: ui-review
description: Perform a rigorous visual and interaction-quality review of the current frontend implementation and produce prioritized improvements.
--------------------------------------------------------------------------------------------------------------------------------------------------

# UI Review

Act as a ruthless senior UI designer.

Inspect the actual implementation.

Evaluate:

* hierarchy
* spacing
* typography
* color
* component consistency
* navigation
* cards
* forms
* icons
* animation
* responsive behavior
* accessibility
* visual polish

## Integrity Checklist

Review the rendered interface, not just source markup, at desktop, laptop,
tablet/iPad, and mobile widths. Repeat the review for meaningful state changes
(expanded, collapsing, collapsed, and restored navigation; empty, normal,
heavy-data, error, disabled, and recovery states).

Check explicitly for control/logo overlap, control/control overlap, clipping,
overflow, incorrect absolute positioning, unexpected gaps, spacing and
alignment errors. For continuous timelines, calendars, grids, and progress
surfaces, verify that child gaps, borders, repeated radii, or backgrounds do
not fragment the parent into disconnected cards.

Validate keyboard focus, touch targets, labels, disabled behavior, and control
reachability after state changes. Challenge whether every metric and control is
necessary and whether the complete result is acceptable in a polished
production application.

Compare the implementation against the project's established design system.

Identify inconsistencies.

Do not accept "looks okay" as a quality bar.

Use this standard:

Would this interface look credible beside leading consumer productivity products?

Return:

## Score

## Critical Issues

## High Priority

## Medium Priority

## Polish

## Recommended Changes

Prioritize issues by user impact.

Do not make changes unless explicitly asked to fix them.
