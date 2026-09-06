import { ArrowRight } from 'lucide-react'
import { REFLECTION_CARDS, type ReflectionCard } from '@/data/reflectionCards'

/**
 * A static prototype grid — 18 reflection topics, two rows of nine on
 * desktop. Its own bordered/surfaced container below `SlotEditor`, same
 * design-system treatment, not nested inside it.
 *
 * Confirmed non-interactive for this prototype: no click handler, no data
 * model, no modal — plain cards (not `<button>`), with only a hover
 * affordance so a static card doesn't read as broken.
 */
export function ReflectionSection() {
  return (
    <section
      aria-labelledby="reflection-heading"
      className="rounded-lg border border-line bg-surface p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      <h2 id="reflection-heading" className="font-display text-slot-time font-semibold text-ink">
        Reflection
      </h2>

      <div className="mt-xl grid grid-cols-9 gap-md mobile:mt-lg mobile:grid-cols-3 mobile:gap-sm">
        {REFLECTION_CARDS.map((card) => (
          <ReflectionCardTile key={card.number} card={card} />
        ))}
      </div>
    </section>
  )
}

function ReflectionCardTile({ card }: { card: ReflectionCard }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-md border border-line bg-bg transition-colors hover:border-ink hover:shadow-elevation-2">
      <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2 p-sm">
        {/* Illustration-only crop — the caption below is what actually
            carries the meaning, so the image itself stays decorative. */}
        <img src={card.image} alt="" className="size-full rounded-sm object-contain" />
      </div>

      <div className="flex flex-1 flex-col gap-xs p-md pb-2xl">
        <p className="text-note font-semibold leading-snug text-ink">
          {/* A trailing period, not a bare digit, inside its own span — a
              bare "<span>7</span>" would collide with unrelated numeric
              literals elsewhere in the page's markup (e.g. the timeline
              hour ruler's own "7"). */}
          <span className="mr-xs font-normal text-ink-dim">{card.number}.</span>
          {card.title}
        </p>
        <p className="text-caption text-ink-dim">{card.subtitle}</p>
      </div>

      <span
        aria-hidden="true"
        className="absolute bottom-sm right-sm flex size-[22px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim transition-colors group-hover:border-ink group-hover:text-ink"
      >
        <ArrowRight className="size-[12px]" />
      </span>
    </div>
  )
}
