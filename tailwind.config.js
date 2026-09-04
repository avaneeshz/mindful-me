/** @type {import('tailwindcss').Config} */

// Design tokens are declared ONCE here. Every colour is backed by a CSS custom
// property in app/src/styles/index.css, which is what makes the light/dark
// theme toggle possible — a component never touches a hex literal; it reaches
// for `bg-surface`/`text-ink`/etc. and the CSS variable underneath resolves to
// whichever theme is active. No raw hex values may appear in components.
export default {
  content: ['./app/index.html', './app/src/**/*.{ts,tsx}'],
  theme: {
    // --- Spacing scale (replaces Tailwind's default numeric scale entirely, so
    // an off-scale value like `p-5` simply does not compile). ---
    spacing: {
      0: '0px',
      px: '1px',
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '32px',
      '4xl': '40px',
      '5xl': '48px',
    },

    // --- Radius scale: 4 steps, consolidating the prototype's 7-20px scatter. ---
    borderRadius: {
      none: '0px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      full: '9999px',
    },

    // --- Type scale: every size the spec names, and nothing else. ---
    fontSize: {
      h1: ['28px', { lineHeight: '1.15' }],
      'h1-sm': ['22px', { lineHeight: '1.15' }],
      brand: ['18px', { lineHeight: '1.2' }],
      'slot-time': ['20px', { lineHeight: '1.2' }],
      stepper: ['16px', { lineHeight: '1.2' }],
      'entry-name': ['14px', { lineHeight: '1.3' }],
      btn: ['13.5px', { lineHeight: '1.2' }],
      body: ['13px', { lineHeight: '1.4' }],
      note: ['12.5px', { lineHeight: '1.45' }],
      meta: ['12px', { lineHeight: '1.3' }],
      caption: ['11.5px', { lineHeight: '1.35' }],
      'caption-sm': ['11px', { lineHeight: '1.35' }],
      micro: ['10.5px', { lineHeight: '1.2' }],
      nano: ['10px', { lineHeight: '1.2' }],
    },

    // --- Monochrome theme system (confirmed product decision, replacing the
    // old forest-green/warm-ivory palette AND the per-category/per-item
    // colour systems entirely — "no colour anywhere", light and dark are
    // both this same neutral pair, just inverted). Every token below is a
    // CSS custom property (styles/index.css) so `[data-theme]` can actually
    // swap the whole app's colours at runtime; there is no hardcoded hex
    // left in this file for anything theme-facing. See index.css for the
    // light/dark value pairs themselves — the ONE place they're declared. ---
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#FFFFFF',
      black: '#000000',

      bg: 'var(--bg)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      ink: 'var(--ink)',
      'ink-dim': 'var(--ink-dim)',
      line: 'var(--line)',
      'line-soft': 'var(--line-soft)',
      // The "invert" pair — a selected/active/primary fill is the OTHER
      // end of the theme (near-black on light, near-white on dark), never a
      // new hue. This is what a "selected" chip, the primary button, and
      // the NOW badge all reach for.
      'inv-bg': 'var(--inv-bg)',
      'inv-ink': 'var(--inv-ink)',

      // The Night timeline strip's one deliberate exception: a fixed grey,
      // independent of the light/dark theme toggle (stays grey in both
      // modes) — see index.css's `--night-strip-fixed` for why this is a
      // literal, not theme-switched like everything else here. The two
      // companion tokens are what stays legible drawn ON that fixed surface
      // (the midnight tick, the Night row's own NOW marker) regardless of
      // which theme the rest of the app is in.
      'night-strip-fixed': 'var(--night-strip-fixed)',
      'night-strip-fixed-ink': 'var(--night-strip-fixed-ink)',
      'night-strip-fixed-line': 'var(--night-strip-fixed-line)',
    },

    extend: {
      screens: {
        // The ONE global breakpoint, exactly as the approved responsive
        // strategy requires: everything above it keeps the desktop structure.
        mobile: { max: '768px' },
        // iPad landscape (and any short, wide viewport). Used ONLY to tighten
        // vertical spacing in the top zone — never to restructure layout.
        'ipad-land': {
          raw: '(orientation: landscape) and (min-width: 900px) and (max-height: 900px)',
        },
        // Capability queries, not size queries: hover affordances do not exist
        // on touch, and touch is a primary target for this product.
        touch: { raw: '(hover: none)' },
        hoverable: { raw: '(hover: hover)' },
      },

      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },

      // Exactly two elevation levels. elevation-1 is reused verbatim from the
      // prototype's .card and is the ONLY resting shadow in the product.
      // elevation-2 is transient (hover/active) only.
      boxShadow: {
        'elevation-1': '0 2px 14px rgba(61,58,53,0.05)',
        'elevation-2': '0 4px 20px rgba(27,59,50,0.08)',
        'elevation-1-up': '0 -2px 14px rgba(61,58,53,0.05)',
        none: 'none',
      },

      // Fixed control dimensions the spec names explicitly.
      height: {
        header: '40px',
        segment: '36px',
        stepper: '40px',
        row: '56px',
        'timeline-row': '48px',
        // Short landscape viewports (iPad landscape) — same density adaptation
        // as `timeline-row-sm` on mobile, sized to keep the editor's primary
        // action above the fold at 834px tall. See Acceptance Criterion 13.
        'timeline-row-md': '42px',
        'timeline-row-sm': '36px',
        meter: '6px',
        control: '44px',
      },
      minHeight: {
        row: '56px',
        control: '44px',
      },
      width: {
        sidebar: '230px',
        staging: '280px',
        control: '44px',
      },
      size: {
        chip: '32px',
        flag: '44px',
        stepper: '40px',
        brand: '38px',
        avatar: '38px',
        // Square mirrors of the `height` steps above, so the circular period
        // anchor's diameter is literally the same token as the strip's height
        // at every breakpoint — the two can never drift apart.
        'timeline-row': '48px',
        'timeline-row-md': '42px',
        'timeline-row-sm': '36px',
      },
      borderWidth: {
        1.5: '1.5px',
        2.5: '2.5px',
      },
      outlineWidth: {
        1.5: '1.5px',
        2.5: '2.5px',
      },
      outlineOffset: {
        // Paired with the matching `outlineWidth` steps above, so a ring can be
        // inset by exactly its own width and sit flush inside its container.
        1.5: '1.5px',
        2.5: '2.5px',
      },
      letterSpacing: {
        tag: '0.06em',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      keyframes: {
        'undo-fade': {
          '0%': { opacity: '1' },
          '92%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        // The Sun/Moon end-cap for whichever row is the REAL current period
        // glows. Rest and peak frames both carry a real box-shadow (not
        // "none") so `motion-reduce:animate-none` (Timeline.tsx) leaves a
        // static glow in place rather than removing it.
        'anchor-glow': {
          '0%, 100%': {
            boxShadow: '0 0 0 3px rgba(212,168,87,0.18), 0 0 14px 2px rgba(212,168,87,0.45)',
          },
          '50%': {
            boxShadow: '0 0 0 5px rgba(212,168,87,0.28), 0 0 22px 5px rgba(212,168,87,0.7)',
          },
        },
        'anchor-glow-night': {
          '0%, 100%': {
            boxShadow: '0 0 0 3px rgba(255,255,255,0.2), 0 0 14px 2px rgba(255,255,255,0.5)',
          },
          '50%': {
            boxShadow: '0 0 0 5px rgba(255,255,255,0.32), 0 0 22px 5px rgba(255,255,255,0.78)',
          },
        },
      },
      animation: {
        'undo-fade': 'undo-fade 4000ms linear 1 forwards',
        'anchor-glow': 'anchor-glow 2600ms ease-in-out infinite',
        'anchor-glow-night': 'anchor-glow-night 2600ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
