---
name: project-slotting-stabilization-review
description: Findings from the 2026-08-25 stabilization UX review of the 30-Minute Slotting screen, post-redesign/post-bugfix
metadata:
  type: project
---

On 2026-08-25 ran a stabilization-only UX review (no new design direction) of the
"30-Minute Slotting" screen in `app/src/` after an approved redesign + a verified
bug-fix pass. Two confirmed defects stood out as high-value, non-obvious findings:

1. **Primary CTA text is illegible** ("Add to slot" / "Save changes" in
   `app/src/components/editor/StagingPane.tsx` and `SlotEditor.tsx`, via
   `app/src/components/ui/button.tsx`). Root cause: `cn()` (`app/src/lib/utils.ts`)
   uses bare `twMerge` with no project config, and the project's custom Tailwind
   `fontSize` scale (`btn`, `meta`, `nano`, `micro`, etc. in `tailwind.config.js`)
   collides with twMerge's default text-color class group. `bg-forest text-white
   font-bold text-btn` merges down to drop `text-white`, leaving inherited
   charcoal text on a forest-green button — reproduces on desktop, iPad
   landscape/portrait, and the mobile sticky bar (same variant, same bug
   everywhere). Same root cause silently drops `text-nano` on the timeline NOW
   badge and FlagsRow captions (render at inherited 13px instead of 10px).
   Fix is a `cn()`/twMerge config problem, not a one-off className tweak — see
   [[feedback-cdp-headless-review-method]] for how this was verified.

2. **Primary action falls below the fold with no scroll affordance** on iPad
   landscape (1194×834, the stated primary target device) specifically when the
   duration-ceiling capacity message renders (i.e. adding/editing the 2nd
   activity in a partially-filled slot — a core, common case, not an edge case).
   The scroll container is `<main class="... overflow-y-auto">`, not
   `document.documentElement`, so `document.documentElement.scrollHeight` checks
   give a false "fits fine" reading — this directly contradicts the explicit
   "Acceptance Criterion 13: no scrolling on iPad landscape" comment in
   `TodayPage.tsx`. Confirmed via exact device-metrics emulation (see below), not
   the naive check.

Full report (all confirmed defects, new open questions, and things working well)
was delivered as the conversation's final message, not saved as a file per
project convention.
