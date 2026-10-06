# Decisions — mindful-me

Product decisions that change or make an exception to a standing rule. Newest first.

## 2026-10-06 — Edit-mode round (#10, #11, #14, #15, #16, #17)

- **Edit mode locks every logging surface (#17).** Timeline (including the Sun/Moon caps), State Tiles, Slot Details actions and Non-Negotiable Buttons can't create or change entries while editing. A tap shows "Finish editing to log". Entering Edit mode cancels a half-staged log.
- **Sun/Moon totals (#11)** are one total per icon for the viewed day, always in plain minutes (`80m`, never `1h 20m`), hidden when zero. Only "Sun Exposure" / "Moon Exposure" entries count.
- **Section names (#14)** are fixed product vocabulary: Non-Negotiable Buttons, Timeline, Slot Details, Tile/Activities, State Tiles (formerly "Reflection"). Shown in Edit mode as name + one line. Source of truth: `app/src/domain/appLanguage.ts` and `APP-LANGUAGE.md`.
- **Header-button reorder is drag-only (#16)**, within its own group, Edit mode only, synced across devices. This is an approved exception to CLAUDE.md rule 5 (tap equivalent for every drag); see `MOBILE-READINESS.md` MR-9.
- **Uploaded icons (#15)** for tiles and activities: PNG or SVG, square, at least 128×128 px (PNG), up to 200 KB. A plain background is removed in the browser (no new library); the result is a single-colour silhouette tinted to the theme, previewed and approved before saving. Stored server-side (`custom_icons`), signed-in only, so every device sees it. An icon still in use can't be deleted.
- **Calendar (#10)** shows Indian national holidays and festivals of all major faiths (not observance days) from Google's public "Holidays in India" calendar via the `india-holidays` edge function (secret `GOOGLE_CALENDAR_API_KEY`), plus the user's own important days, which always repeat yearly and sync to the account. Names are written inside each date cell. Feb 29 personal days show on Feb 28 in non-leap years.
- **Classic only.** None of this applies to Lumen.
