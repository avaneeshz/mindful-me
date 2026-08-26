---
name: project-stabilization-pass-scope
description: OPEN-QUESTIONS.md is a binding do-not-touch register in this project, not a backlog to work through
metadata:
  type: project
---

Items in `OPEN-QUESTIONS.md` are deliberately-unresolved product/design
decisions and must NOT be settled by an implementation pass. Leave current
behavior as-is and flag, rather than picking an answer.

**Why:** the file exists specifically so unresolved decisions "don't silently
become de facto answers just because current behavior happens to preserve
them." Several entries (tile-label truncation, the Day/Night control's visual
metaphor, the Mind & Rest contrast token) are one small code change away from
being accidentally decided by an engineer, which is exactly what the register
is there to prevent.

**How to apply:** read `OPEN-QUESTIONS.md` before starting any work on this
repo. If a fix would touch one of its items, do the narrowest thing that fixes
the confirmed defect, and report the boundary you stopped at. A defect that
*affects* an open question (e.g. an animation that never fired, feeding the
"control looks broken" question) is still fixable — the defect is in scope, the
design question is not. Verification technique: [[feedback-visual-verification]].
