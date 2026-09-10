import { REFLECTION_CARDS, type ReflectionCard } from '@/data/reflectionCards'

/**
 * A static prototype grid — 18 reflection topics, two rows of nine on
 * desktop. Its own bordered/surfaced container below `SlotEditor`, same
 * design-system treatment, not nested inside it.
 *
 * Each tile is the illustration itself, framed as a card, with only the
 * topic name beneath it — no number, no subtitle, no icon.
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
    <div className="flex flex-col overflow-hidden rounded-md border border-line bg-surface transition-colors hover:border-ink hover:shadow-elevation-2">
      <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
        <img src={card.image} alt="" className="size-full object-cover" />
      </div>
      {/* `break-words` keeps a single long-word title ("Environment",
          "Boundaries") wrapping onto a second line at ipad-land/mobile
          widths instead of overflowing past the tile and getting silently
          hard-clipped by the ancestor tile's `overflow-hidden`. */}
      <p className="break-words border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">
        {card.title}
      </p>
    </div>
  )
}
