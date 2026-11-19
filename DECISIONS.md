# Decisions — mindful-me

Product decisions that change or make an exception to a standing rule. Newest first.

## 2026-11-19 — Voice dictation

- **What:** a mic button on free-text note fields. Tap to start, tap to stop; the speech is transcribed and inserted at the cursor. Classic and Lumen share one hook (`useDictationField`) and differ only in look.
- **Engine: Whisper via Groq's free API** (`whisper-large-v3-turbo`; `whisper-large-v3` selectable with the `TRANSCRIBE_MODEL` secret, better for Hindi/Hinglish). Chosen for accuracy close to ChatGPT dictation at zero cost, and because the browser's built-in speech recognition is inconsistent across browsers and weak on mixed Hindi/English. Language is auto-detected.
- **The Groq key lives only as the `GROQ_API_KEY` Supabase edge-function secret.** The `transcribe` edge function is the only thing that talks to Groq.
- **Tap-to-toggle, not hold-to-talk**, so it works on touch and with a keyboard. Transcription happens after stop (no live streaming).
- **No audio and no transcript is stored or logged**, on the device or the server. Only a usage row (user, time, seconds) is kept for limits. Edge-function traffic is already logged by name and status only.
- **Limits live in Postgres** (`reserve_transcription_quota`): 60 requests per rolling hour and 3600 audio seconds per 24 hours per user. They keep the shared free tier from being used up by one account or one bug.
- **Privacy:** audio goes to a third party (Groq). There is **no first-use pop-up** (product decision, 2026-11-19): the mic just works. Settings has an on/off switch that states plainly that audio is sent to Groq and not stored (`lib/dictationPrefs.ts`, through the storage adapter). `VOICE_DICTATION_ENABLED` in `lib/featureFlags.ts` is the developer kill switch.
- **Engine behind the hook:** swapping in an on-device model later changes the `useDictation` deps, not the UI.
- **Fields that get a mic:** reflection notes (State Tile notes and card notes), header note buttons, checklist item notes, display-value (sleep) notes, log-activity notes (primary and secondary), note edit rows and the reflection-mapping note, in both interfaces. **No mic** on short names and identifiers (important-day name, day-off reason, button/activity names), auth, search, numbers, times, or icon fields.

## 2026-10-06 — Edit-mode round (#10, #11, #14, #15, #16, #17)

- **Edit mode locks every logging surface (#17).** Timeline (including the Sun/Moon caps), State Tiles, Slot Details actions and Non-Negotiable Buttons can't create or change entries while editing. A tap shows "Finish editing to log". Entering Edit mode cancels a half-staged log.
- **Sun/Moon totals (#11)** are one total per icon for the viewed day, always in plain minutes (`80m`, never `1h 20m`), hidden when zero. Only "Sun Exposure" / "Moon Exposure" entries count.
- **Section names (#14)** are fixed product vocabulary: Non-Negotiable Buttons, Timeline, Slot Details, Tile/Activities, State Tiles (formerly "Reflection"). Shown in Edit mode as name + one line. Source of truth: `app/src/domain/appLanguage.ts` and `APP-LANGUAGE.md`.
- **Header-button reorder is drag-only (#16)**, within its own group, Edit mode only, synced across devices. This is an approved exception to CLAUDE.md rule 5 (tap equivalent for every drag); see `MOBILE-READINESS.md` MR-9.
- **Uploaded icons (#15)** for tiles and activities: PNG or SVG, square, at least 128×128 px (PNG), up to 200 KB. A plain background is removed in the browser (no new library); the result is a single-colour silhouette tinted to the theme, previewed and approved before saving. Stored server-side (`custom_icons`), signed-in only, so every device sees it. An icon still in use can't be deleted.
- **Calendar (#10)** shows Indian national holidays and festivals of all major faiths (not observance days) from Google's public "Holidays in India" calendar via the `india-holidays` edge function (secret `GOOGLE_CALENDAR_API_KEY`), plus the user's own important days, which always repeat yearly and sync to the account. Names are written inside each date cell. Feb 29 personal days show on Feb 28 in non-leap years.
- **Classic only.** None of this applies to Lumen.
