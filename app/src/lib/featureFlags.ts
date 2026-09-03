/**
 * Code-level feature flags — a plain constant a developer flips and
 * rebuilds, never a user-facing setting or a `VITE_...` env var. There is no
 * UI anywhere to change these; they exist purely so the team can compare two
 * implementations without deleting either one.
 */

/**
 * Duration control fallback (Modal Redesign §C). The drag-block ruler is the
 * default and only visible duration control. Flipping this to `true` swaps
 * it OUT in favour of the old numeric +/- stepper and quick-add buttons
 * (`DurationStepperFallback`) for debugging/comparison — the two are
 * mutually exclusive, never shown together, and both still dispatch the
 * exact same `stepDuration`/`setDuration` reducer actions either way.
 */
export const SHOW_DURATION_STEPPER_FALLBACK = false
