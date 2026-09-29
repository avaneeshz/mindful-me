import { FLAGS, QUALITIES, SYMPTOMS } from '@/data/activities'
import type { ParameterType } from '@/api/parameterOptions'

/**
 * The static 18/6/14 default vocabulary, read-only-preview shape, shared by
 * every parameter-options hook's zero-backend branch (rule 6) —
 * `useParameterVocabulary`, `useEffectiveParameterOptions`,
 * `useActivityParameterSelections`. Pulled out into its own module so all
 * three generate the EXACT SAME synthetic option ids for the same label —
 * without this, `useActivityParameterSelections`'s local-only checklist
 * couldn't match rows against `useParameterVocabulary`'s local-only list at
 * all (two independently-generated ids for "Resonance" would never be equal).
 */
export interface LocalOnlyOption {
  id: string
  label: string
}

function idFor(type: ParameterType, label: string): string {
  return `local:${type}:${label}`
}

export function localOnlyVocabulary(): Record<ParameterType, LocalOnlyOption[]> {
  return {
    quality: QUALITIES.map((q) => ({ id: idFor('quality', q.id), label: q.id })),
    symptom: SYMPTOMS.map((s) => ({ id: idFor('symptom', s.id), label: s.id })),
    flag: FLAGS.map((f) => ({ id: idFor('flag', f.id), label: f.id })),
  }
}

/**
 * A `Record<ParameterType, T[]>` with every type starting empty — pulled out
 * here too (found in code review: three separate hooks each had their own
 * copy of this one-line helper) so a future fourth parameter type only ever
 * needs updating in this one place, alongside `localOnlyVocabulary` above.
 */
export function emptyByParameterType<T>(): Record<ParameterType, T[]> {
  return { quality: [], symptom: [], flag: [] }
}
