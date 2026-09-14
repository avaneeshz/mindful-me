# Memory Index

- [Visual & responsive verification](feedback_visual_verification.md) — use CDP device metrics; document-level scroll checks give false passes here.
- [Stabilization pass scope](project_stabilization_pass_scope.md) — OPEN-QUESTIONS.md is a do-not-touch register, not a backlog.
- [Write-failure-visibility fix](project_write_failure_visibility_fix.md) — sync queue/reconcile design decisions and deliberate scope boundaries.
- [App.smoke.test.tsx timeout flake](project_app_smoke_test_timeout_flake.md) — pre-existing flake, can hit even standalone on a slow run; not a regression signal.
- [ScheduledActivity has no per-row date](project_scheduled_activity_no_date.md) — cross-day queries need a separate wrapper keeping local_date, don't touch the single-day path.
- [No jsdom/testing-library in this repo](feedback_hook_testing_no_jsdom.md) — component tests only cover closed-state SSR; test hook logic via extracted pure functions instead.
