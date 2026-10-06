# mindful-me — Mobile Readiness Backlog

This backlog tracks cleanup that keeps a **future iOS and Android app** cheap to build. No native app is planned or approved yet (see `ROADMAP.md`). This is preparation work, sequenced behind product work and done opportunistically.

The rules this backlog enforces are in `CLAUDE.md` → **Platform Portability** and in `.claude/agents/full-stack-engineer.md` → **Portability Rules**. In short: logic and data code must work without a browser, and only screens may be web-specific.

**How to use this file**

- Each item has an ID (`MR-n`), a priority and the exact files involved, as audited on `develop` at `f7a62e0` (2026-09-29).
- When you touch a listed file for other work and the fix is small, fix it in the same PR and move the item to **Done** with the PR number.
- New gaps found later get added here, not left in chat.
- Priority: **P1** = cheap now and expensive later, do soon · **P2** = do when touching the area · **P3** = only needed once a native app is approved.

## What's already in good shape

These are the reasons a future native app is realistic. Don't regress them.

- **`domain/` is pure.** No file in `app/src/domain/` imports React, the DOM or storage, and the logic is covered by Vitest tests that would run unchanged in React Native.
- **Two interfaces already share one data layer.** Classic (`components/`, `routes/`) and Lumen (`lumen/`) read and write through the same `domain/`, `api/` and `state/` modules. A native app would be a third consumer of that layer, not a rewrite.
- **Local-first with a sync queue** (`state/localPersistence.ts`, `state/sync.ts`, `state/syncQueue.ts`) is the architecture mobile apps need anyway.
- **Rules live in Postgres**: every table created in `supabase/migrations/` enables RLS, a DB-level no-overlap constraint and validated RPCs. A second client can't bypass them.
- **Times are stored as wall-clock time plus an IANA time zone** (product rule 3).
- **The Health Sync OAuth callback edge function takes `redirectUri` from the client** instead of assuming a web origin, so the server side already accepts mobile deep-link redirects.

---

## Open items

### MR-1 · P1 · Storage adapter for all device storage

Eleven files call `localStorage`/`sessionStorage` directly:

- `lib/displayValuesLocalStore.ts`, `lib/headerButtonsLocalStore.ts`, `lib/noteEntriesLocalStore.ts`, `lib/supplementsLocalStore.ts`
- `lib/interfaceMode.ts`, `lib/googleHealthOAuth.ts` (sessionStorage)
- `state/localPersistence.ts`, `state/syncQueueStorage.ts`, `state/dismissedActivities.ts`
- `lumen/data/catalog.ts`, `lumen/lib/store.tsx`

**Fix:** add one `lib/storage.ts` adapter (get/set/remove JSON with the existing fail-closed contract) and route all eleven files through it. On native, only that one file changes (to MMKV or SQLite).

**Progress:** `lib/storage.ts` now exists (`readStoredJSON`/`writeStoredJSON`, synchronous and fail-closed) and the day-off cache (`state/useDayOffs.ts`) uses it. The eleven files above still need moving over.

**Design note:** React Native's AsyncStorage is async, while MMKV is sync like `localStorage`. Keep the adapter synchronous and plan on MMKV, so the fail-closed callers don't all have to become async.

### MR-2 · P1 · UI components that call the API directly

These UI files call `api*` functions at runtime instead of going through a hook, which mixes data fetching into screens:

| File | Direct call |
|---|---|
| `routes/SettingsPage.tsx` | `apiGetHealthConnectionStatus` |
| `components/DownloadDayButton.tsx` | `apiListNoteEntriesForDate` |
| `components/HeaderButtonEditor.tsx` | `catalogIdForName` |
| `lumen/screens/settings/buttons.tsx` | `catalogIdForName` |

**Fix:** move each call into a `state/` hook (e.g. `useHealthMetrics`, `useHealthConnectionStatus`, `useNoteEntriesForDate`) or an existing one, and have the component call the hook. Behaviour stays the same.

### MR-3 · P2 · `supabaseConfigured` read inside screens

`lumen/screens/settings/buttons.tsx` and `lumen/screens/settings/library.tsx` import `supabaseConfigured` from `lib/supabaseClient.ts`. (`lumen/data/*` and `lumen/lib/store.tsx` are data-layer files, so they're fine.)

**Fix:** expose "is sync available" through an existing context or hook (e.g. from `AuthContext`), so screens never import the client module.

### MR-4 · P2 · Shared types imported from `api/` into UI

UI files import DTO types from `api/`, which ties screen code to the transport layer:

- `components/HeaderBar.tsx`, `components/HeaderButtonEditor.tsx`: `CreateHeaderButtonInput`, `UpdateHeaderButtonInput`
- `components/activityLibrary/ParameterOptionsPanel.tsx`, `ParameterVocabularyPanel.tsx`, `lumen/screens/settings/parts.tsx`: `ParameterType`
- `components/activityLibrary/TileList.tsx`: `TileDto`
- `components/healthsync/HealthMetricChart.tsx`, `HealthTypeCard.tsx`: `HealthMetricPoint`, `HealthDataTypeSummary`

**Fix:** move shared shapes into `domain/types.ts` (or a domain file per feature) and have `api/` re-export them. These are type-only imports, so there's no runtime risk and they can be done any time.

### MR-5 · P1 · Generated database types

API payload types in `api/*.ts` are hand-written. Nothing checks them against the actual schema.

**Fix:** generate types with `supabase gen types typescript` into e.g. `app/src/api/database.types.ts`, type the client with them, and regenerate on every migration. A future mobile app would import the same file, giving one data contract instead of two hand-maintained copies.

### MR-6 · P2 · One config module for environment variables

`import.meta.env` (Vite-only) is read in three places: `lib/supabaseClient.ts`, `state/useHealthConnection.ts` (`VITE_GOOGLE_HEALTH_CLIENT_ID`) and `data/activities.ts` (`DEV`).

**Fix:** add `lib/config.ts` as the only reader and import config values from it. Expo uses `EXPO_PUBLIC_*` instead, so only that one file would change.

### MR-7 · P2 · Google Health OAuth tied to the browser

`lib/googleHealthOAuth.ts` builds the redirect from `window.location.origin` and stores OAuth state in `sessionStorage`. `state/useHealthConnection.ts` navigates with `window.location.href`.

**Fix:** put "start OAuth", "get redirect URI" and "store/verify state" behind a small `lib/oauth` adapter. The server side is already ready (see "good shape" above). Native would use `expo-auth-session` or deep links, and a native redirect URI must also be registered with Google.

### MR-8 · P3 · Other browser-only capabilities

Each of these needs a thin adapter before a native build. Nothing needs changing today.

| Capability | Where | Native replacement |
|---|---|---|
| PDF export + download (`jsPDF`, `doc.save`) | `lib/dayExportPdf.ts`, `components/DownloadDayButton.tsx` | `expo-print` + share sheet |
| Geolocation for weather | `lib/weather.ts` (`navigator.geolocation`) | `expo-location` |
| Theme via `data-theme` on `<html>` | `lib/theme.ts`, `lib/interfaceMode.ts` | native color scheme + tokens |
| Reconnect (`online`) event that wakes the sync queue | `state/useSyncQueue.ts` (`window.addEventListener`) | NetInfo + AppState |
| Supabase auth session in browser storage | `lib/supabaseClient.ts` (default `persistSession` storage) | `createClient` `auth.storage` = SecureStore |

**Tip for now:** the Supabase client is simple to prepare. Letting `lib/supabaseClient.ts` accept an `auth.storage` option costs nothing today.

### MR-9 · P2 · Tap parity for drag interactions

`components/Timeline.tsx`, `components/editor/TileRow.tsx` and `components/editor/DurationDragBlock.tsx` use HTML5 drag-and-drop, which doesn't exist on native and is weak on touch browsers. Tap paths exist today: select-a-slot-then-pick-an-activity, and the duration stepper (`DurationStepperFallback.tsx`, behind an off-by-default flag).

**To do:**

1. Confirm every drag in these three files has a tap equivalent that works on a phone browser, including dragging a tile from `TileRow.tsx` onto the timeline.
2. Keep those paths covered by tests so they can't be removed silently.

A native app would rebuild these gestures (Reanimated + Gesture Handler) on top of the same `domain/scheduling.ts` functions.

**Approved exception (2026-10-06):** reordering header buttons in Edit mode (`components/ui/usePointerReorder.ts`, used by `HeaderBar.tsx`) is drag-only — mouse on PC, finger on iPad. The product owner explicitly declined a tap alternative (no move arrows). It uses Pointer Events rather than HTML5 drag-and-drop, so it already works on touch; the order logic itself is pure (`domain/headerButtons.ts`: `moveId`, `orderAfterGroupReorder`). Revisit if keyboard or switch-access reordering is ever needed.

### MR-10 · P1 · In-app account deletion

No account-deletion flow exists (no UI, RPC or edge function). **Both the App Store and Google Play require in-app account deletion** for any app with account creation, and GDPR requires it too.

**Fix:** a Settings action plus a server-side function that deletes the auth user and cascades or purges their rows (respecting the 30-day recovery window in product rule 11 where it applies). This is a **product requirement to confirm** before building, because it changes user-visible behaviour.

### MR-11 · P3 · Full personal-data export

Only a per-day PDF exists (`lib/dayExportPdf.ts`). Full "download all my data" (JSON/CSV) supports GDPR data portability and is expected for health apps in the stores. This is a product requirement to confirm.

### MR-12 · P3 · Localization readiness

There is no i18n library, and UI strings are inline in components. Date/number formatting uses `toLocale*` in about 14 places.

**For now:** new modules keep their user-facing strings in one `strings.ts` per module, and date/number formatting goes through `lib/localTime.ts` helpers instead of ad-hoc `toLocale*` calls. Adopting an i18n library waits until a second language is an actual requirement.

### MR-13 · P3 · Module structure for existing features

Existing features (Classic board, header buttons, notes, supplements, health sync, activity library, Lumen) live in a shared flat layout rather than `app/src/modules/<name>/`. **Don't restructure them now.** New modules (gardening, healthcare, baby care, food, and so on) start in `modules/` from day one. Move an existing feature only when it's being substantially reworked anyway.

### Related, tracked elsewhere

- **Live DB / repo migration drift** and the `record_local_edit_conflict` advisory are in `BACKLOG.md` → Known issues. A second client makes the repo-as-source-of-truth for schema even more important.
- **Per-device settings** (`lib/interfaceMode.ts`, hidden tiles, Lumen colours) should become per-user rows (the planned `user_preferences` table) so they follow the user to a phone.

---

## Explicitly not now

- React Native, Expo, Capacitor or any native project.
- A monorepo or workspace split (`packages/domain`, etc.). The layer rules above make that a mechanical move later.
- Making the web UI look or behave "native" at the cost of the web experience.

## Done

_Nothing yet._
