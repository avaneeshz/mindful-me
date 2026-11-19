import { Chip } from '@/components/ui/chip'
import { useDictationPrefs } from '@/state/useDictationPrefs'
import { VOICE_DICTATION_ENABLED } from '@/lib/featureFlags'

/** Settings → Voice dictation: the on/off switch and what it does with audio. */
export function DictationSettings() {
  const { enabled, setEnabled } = useDictationPrefs()
  if (!VOICE_DICTATION_ENABLED) return null
  return (
    <div className="flex flex-col gap-sm">
      <h2 id="dictation-heading" className="text-body font-semibold text-ink">
        Voice dictation
      </h2>
      <p className="text-caption text-ink-dim">
        Adds a microphone to note fields so you can speak instead of type. Your recording is sent to Groq, a
        speech-to-text service, and is not stored.
      </p>
      <div>
        <Chip
          as="button"
          interactive
          tone={enabled ? 'active' : 'surface'}
          aria-pressed={enabled}
          aria-labelledby="dictation-heading"
          onClick={() => setEnabled(!enabled)}
        >
          {enabled ? 'On' : 'Off'}
        </Chip>
      </div>
    </div>
  )
}
