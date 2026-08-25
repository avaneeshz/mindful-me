---
name: known-bug-h-control-utility
description: Pre-existing Tailwind config bug — h-control utility class does not exist, so every Button with size="control" (the 44px touch-target size) renders ~16-18px tall instead.
metadata:
  type: project
---

`app/src/components/ui/button.tsx`'s `control` size variant applies
`h-control px-lg` with a comment claiming "44px — the standard touch target
height." That utility does not exist: `tailwind.config.js` defines
`control: '44px'` under `theme.extend.minHeight` (and again under `width`),
but never under `theme.extend.height`. `h-control` is therefore a Tailwind
class with no matching rule — confirmed by fetching the dev server's
compiled CSS and by creating a bare `div.h-control` in-page and reading its
computed height (`0px`).

Effect: any `<Button>` using the default/`size="control"` variant — e.g. the
Slot Editor's primary "Add to slot" / "Save changes" and "Cancel" buttons in
`StagingPane.tsx` — renders at only its text line-height (measured ~16-18px
via `getBoundingClientRect`) instead of the intended 44px touch target, on
every breakpoint including iPad. Visually it can look like an unusually thin
but otherwise normal-looking full-width bar, so it is easy to miss without
measuring — a screenshot glance is not enough.

**Why it matters**: this is not in any file list of a "targeted refinement"
PR that touches `StagingPane.tsx`/`Timeline.tsx`/etc. — `button.tsx` and the
`height`/`minHeight` theme keys are not part of such diffs — so it predates
those changes and is not a regression they introduced. But it sits directly
on the primary confirm/cancel path of the Slot Editor and violates the
touch-target requirement ("large touch targets... no cramped controls")
whenever that flow is in scope for review.

**How to apply**: when reviewing any screen that renders a `<Button>` at
the default/control size, measure its actual `getBoundingClientRect().height`
rather than trusting the screenshot — don't assume shadcn/ui-style buttons
are sized correctly just because the className looks right. Re-verify this
memory is still accurate (grep `tailwind.config.js` for `height:` and
`control:`) before citing it again, since it may get fixed without this file
being updated. Not yet listed in `OPEN-QUESTIONS.md` as of 2026-08-25 — worth
flagging for the team to add if it's still true.

See [[mindful-me-app-structure]] and [[cdp-testing-method]].
