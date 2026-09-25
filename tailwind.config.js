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

    // --- Enhanced monochrome theme with restrained semantic accents ---
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#FFFFFF',
      black: '#000000',

      bg: 'var(--bg)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      'surface-3': 'var(--surface-3)',
      ink: 'var(--ink)',
      'ink-dim': 'var(--ink-dim)',
      line: 'var(--line)',
      'line-soft': 'var(--line-soft)',
      'line-softer': 'var(--line-softer)',
      'inv-bg': 'var(--inv-bg)',
      'inv-ink': 'var(--inv-ink)',

      // Restrained accent colors for intentional emphasis
      'accent-primary': 'var(--accent-primary)',
      'accent-primary-dim': 'var(--accent-primary-dim)',
      'accent-success': 'var(--accent-success)',
      'accent-success-dim': 'var(--accent-success-dim)',
      'accent-warm': 'var(--accent-warm)',
      'accent-warm-dim': 'var(--accent-warm-dim)',

      'night-strip-fixed': 'var(--night-strip-fixed)',
      'night-strip-fixed-ink': 'var(--night-strip-fixed-ink)',
      'night-strip-fixed-line': 'var(--night-strip-fixed-line)',

      'sun-cap': 'var(--sun-cap-bg)',
      'sun-cap-ink': 'var(--sun-cap-ink)',
      'moon-cap': 'var(--moon-cap-bg)',
      'moon-cap-ink': 'var(--moon-cap-ink)',

      'status-success': 'var(--status-success)',
      'status-syncing': 'var(--status-syncing)',
      'status-error': 'var(--status-error)',
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

      // Enhanced elevation levels for premium polish
      boxShadow: {
        'elevation-1': '0 2px 14px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
        'elevation-2': '0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.12)',
        'elevation-3': '0 12px 32px rgba(0, 0, 0, 0.20), 0 4px 12px rgba(0, 0, 0, 0.14)',
        'elevation-1-up': '0 -2px 14px rgba(0, 0, 0, 0.12), 0 -1px 4px rgba(0, 0, 0, 0.08)',
        'glow-accent': '0 0 20px rgba(228, 193, 253, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'glow-success': '0 0 20px rgba(134, 239, 172, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
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
      },
      animation: {
        'undo-fade': 'undo-fade 4000ms linear 1 forwards',
      },
    },
  },
  plugins: [],
}
