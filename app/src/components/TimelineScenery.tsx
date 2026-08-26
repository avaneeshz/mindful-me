import type { Period } from '@/domain/types'

/**
 * Decorative illustrated backdrop for a Day/Night timeline row — a gradient
 * sky plus a few hand-drawn silhouette layers (mountains, a tree or pines,
 * birds or stars). Purely decorative: `aria-hidden`, no pointer events, and
 * painted with no z-index of its own so it stacks BELOW the slot buttons and
 * the coloured activity-segment overlay (both of which already claim their
 * layering in Timeline.tsx) — it can never intercept a click or hide a fill.
 *
 * Hand-built with a CSS gradient + inline SVG, matching how the rest of the
 * product is built (Lucide icons + Tailwind, zero raster/vector assets) — an
 * interpretation of the reference mood (soft gradient depth, layered
 * scenery), not a pixel copy of it.
 *
 * One shared 1000x44 viewBox for both scenes, `preserveAspectRatio="xMidYMid
 * slice"` (not "none"): the strip's real aspect ratio ranges from ~20:1 on
 * mobile (720px / 36px) to well past that on a wide desktop viewport, and
 * "none" would stretch the tree canopy and pine triangles into ovals at the
 * wide end. "slice" scales uniformly and crops the overflow instead, so every
 * shape keeps its drawn proportions at every breakpoint — the cost is that
 * content sits away from the outer ~15% on each side, where a wide viewport
 * can crop it.
 */
export function TimelineScenery({ period }: { period: Period }) {
  return period === 'day' ? <DayScenery /> : <NightScenery />
}

function DayScenery() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-r from-sky-day-from to-sky-day-to" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 44"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* Distant mountains */}
        <path
          d="M0,44 L0,29 L70,16 L130,26 L210,12 L280,25 L360,15 L430,27 L510,13 L590,24 L670,17 L750,28 L830,14 L900,23 L1000,18 L1000,44 Z"
          className="fill-scenery-cool"
          opacity="0.45"
        />
        {/* A couple of birds */}
        <g className="stroke-charcoal" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
          <path d="M610,11 q5,-5 10,0 q5,-5 10,0" fill="none" />
          <path d="M665,17 q4,-4 8,0 q4,-4 8,0" fill="none" />
        </g>
        {/* Tree: trunk + a cluster of three overlapping canopy circles */}
        <g transform="translate(180,30)" className="fill-forest">
          <rect x="-2" y="6" width="4" height="12" rx="1.5" />
          <circle cx="0" cy="-6" r="10" />
          <circle cx="-8" cy="1" r="8" />
          <circle cx="8" cy="1" r="8" />
        </g>
      </svg>
    </div>
  )
}

function NightScenery() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* Darkest at the horizontal centre — exactly where the midnight tick
          lands — lighter indigo at both edges (dusk on the left, dawn on the
          right). */}
      <div className="absolute inset-0 bg-gradient-to-r from-sky-night-from via-sky-night-to to-sky-night-from" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 44"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* Stars, scattered in the upper sky */}
        <g className="fill-starlight">
          {[
            [70, 8, 1.4, 0.9],
            [140, 15, 1, 0.6],
            [260, 6, 1.2, 0.75],
            [340, 12, 1, 0.55],
            [430, 7, 1.5, 0.95],
            [560, 13, 1, 0.6],
            [650, 6, 1.3, 0.8],
            [760, 10, 1, 0.55],
            [850, 5, 1.4, 0.9],
            [920, 14, 1, 0.6],
          ].map(([cx, cy, r, o], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
          ))}
        </g>
        {/* Distant mountains, moonlit rather than a classic dark silhouette —
            see the `scenery-cool` token comment in tailwind.config.js. */}
        <path
          d="M0,44 L0,31 L80,20 L150,28 L230,17 L310,27 L390,19 L470,29 L550,18 L640,26 L720,20 L800,29 L880,17 L1000,24 L1000,44 Z"
          className="fill-scenery-cool"
          opacity="0.3"
        />
        {/* Two pine trees, closer than the mountains so slightly bolder */}
        <g className="fill-scenery-cool" opacity="0.85">
          <g transform="translate(150,30)">
            <rect x="-1.5" y="10" width="3" height="8" />
            <path d="M0,-14 L7,0 L-7,0 Z" />
            <path d="M0,-6 L9,6 L-9,6 Z" />
            <path d="M0,2 L11,12 L-11,12 Z" />
          </g>
          <g transform="translate(235,33) scale(0.8)">
            <rect x="-1.5" y="10" width="3" height="8" />
            <path d="M0,-14 L7,0 L-7,0 Z" />
            <path d="M0,-6 L9,6 L-9,6 Z" />
            <path d="M0,2 L11,12 L-11,12 Z" />
          </g>
        </g>
      </svg>
    </div>
  )
}
