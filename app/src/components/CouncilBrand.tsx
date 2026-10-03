import { cn } from '@/lib/utils'

/**
 * Council's header identity: a tiny figure-in-arc mark, and the title with
 * the wordmark's dotted "o". Both are decorative CSS/SVG — the heading text
 * stays the plain word "Council" for assistive tech and copy/paste.
 */
export function CouncilMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-[18px] shrink-0 text-ink mobile:size-[16px]', className)}>
      <ellipse
        cx="16"
        cy="19"
        rx="13"
        ry="6"
        fill="none"
        stroke="var(--brand-dot)"
        strokeWidth="1.5"
        transform="rotate(-8 16 19)"
      />
      <circle cx="16" cy="10.5" r="4.2" fill="currentColor" />
      <path d="M7.5 27c.4-5.2 3.6-8.4 8.5-8.4s8.1 3.2 8.5 8.4z" fill="currentColor" />
    </svg>
  )
}

export function CouncilTitle() {
  return (
    <>
      C
      <span className="relative inline-block after:absolute after:left-1/2 after:top-[58%] after:size-[0.2em] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-[var(--brand-dot)] after:content-['']">
        o
      </span>
      uncil
    </>
  )
}
