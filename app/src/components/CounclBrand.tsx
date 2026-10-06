import { cn } from '@/lib/utils'

/**
 * The six-point ring around a figure — COUNCL's logo, drawn as a vector in
 * `currentColor` so it stays crisp at any size and follows the theme's ink
 * colour in light and dark mode. `app/public/favicon.svg` is the same
 * drawing; keep the two in step.
 */
const RING_ARCS = [
  'M18.6 3.77A12.5 12.5 0 0 1 25.29 7.64',
  'M27.89 12.14A12.5 12.5 0 0 1 27.89 19.86',
  'M25.29 24.36A12.5 12.5 0 0 1 18.6 28.23',
  'M13.4 28.23A12.5 12.5 0 0 1 6.71 24.36',
  'M4.11 19.86A12.5 12.5 0 0 1 4.11 12.14',
  'M6.71 7.64A12.5 12.5 0 0 1 13.4 3.77',
]

const RING_DOTS: readonly [number, number][] = [
  [16, 3.5],
  [26.83, 9.75],
  [26.83, 22.25],
  [16, 28.5],
  [5.17, 22.25],
  [5.17, 9.75],
]

export function CounclMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn('size-[22px] shrink-0 text-ink mobile:size-[20px]', className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        {RING_ARCS.map((d) => (
          <path key={d} d={d} />
        ))}
        <path d="M11.07 23.04A8.6 8.6 0 0 1 11.07 8.96" strokeWidth="1.6" />
        <path d="M20.93 8.96A8.6 8.6 0 0 1 20.93 23.04" strokeWidth="1.6" />
      </g>
      <g fill="currentColor">
        {RING_DOTS.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.55" />
        ))}
        <circle cx="16" cy="11" r="1.9" />
        <path d="M16 13.6C17 15.5 18.4 17.4 18.4 19.6a2.4 2.4 0 0 1-4.8 0c0-2.2 1.4-4.1 2.4-6z" />
      </g>
    </svg>
  )
}

/** The product name as it's always written: all capitals, no "i". */
export const PRODUCT_NAME = 'COUNCL'

export function CounclTitle() {
  return <span className="tracking-[0.08em]">{PRODUCT_NAME}</span>
}
