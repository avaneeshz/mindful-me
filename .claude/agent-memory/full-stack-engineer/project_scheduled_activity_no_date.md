---
name: project-scheduled-activity-no-date
description: ScheduledActivity (client type) carries no absolute calendar date — only day-relative startMinutes/durationMinutes — so any cross-day query needs a separate path that keeps local_date alongside each row.
metadata:
  type: project
---

`domain/types.ts`'s `ScheduledActivity` has no `date`/`localDate` field — only
`startMinutes`/`durationMinutes` (minutes since THAT activity's own local
midnight) plus `timezone`. `api/scheduledActivities.ts`'s `dtoToClient` drops
the DTO's `local_date` entirely. This was a safe simplification as long as
every caller of `apiListScheduledActivities` queried exactly one calendar day
at a time (`lib/localTime.ts`'s `localDayRange(viewedDate)` — true of every
call site as of 2026-09-14: `BoardContext`'s hydrate effect is the only
consumer).

**Why it matters:** the moment a query spans multiple days (e.g. a 90-day
cross-day history lookback), `startMinutes` alone can't tell which day a row
belongs to, so you can't sort chronologically across days or exclude one
specific day from a multi-day result.

**How to apply:** don't reach for `apiListScheduledActivities` or add a
`date` field to the shared `ScheduledActivity` type for a new multi-day
feature — that type/function is relied on elsewhere as single-day-scoped and
churning it isn't warranted. Instead add a small parallel read that maps the
DTO's own `local_date` into a wrapper type (`{ activity, localDate }`) — see
`api/scheduledActivities.ts`'s `apiListScheduledActivitiesWithDates` /
`ScheduledActivityWithDate`, added for `state/useSessionHistory.ts`'s
cross-day session lookback (SCRUM header-control-history-split work). Keep
the existing single-day function and its callers completely untouched.

Related: [[feedback-hook-testing-no-jsdom]].
