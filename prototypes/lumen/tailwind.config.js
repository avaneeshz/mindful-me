/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: {
          1: token('surface-1'),
          2: token('surface-2'),
          3: token('surface-3'),
        },
        line: token('line'),
        ink: {
          DEFAULT: token('ink'),
          muted: token('ink-muted'),
          faint: token('ink-faint'),
        },
        accent: { DEFAULT: token('accent'), ink: token('accent-ink') },
        mint: token('mint'),
        sun: token('sun'),
        dusk: token('dusk'),
        rose: token('rose'),
        sky: token('sky'),
        lilac: token('lilac'),
        sage: token('sage'),
        sand: token('sand'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['15px', { lineHeight: '22px' }],
        lg: ['17px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
        xl: ['20px', { lineHeight: '26px', letterSpacing: '-0.015em' }],
        '2xl': ['26px', { lineHeight: '30px', letterSpacing: '-0.02em' }],
        '3xl': ['32px', { lineHeight: '36px', letterSpacing: '-0.025em' }],
        '4xl': ['40px', { lineHeight: '44px', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        control: '12px',
        tile: '18px',
        card: '22px',
        panel: '28px',
      },
      boxShadow: {
        surface:
          'inset 0 1px 0 0 rgb(255 255 255 / 0.04), 0 1px 2px 0 rgb(0 0 0 / 0.35), 0 12px 32px -18px rgb(0 0 0 / 0.7)',
        raised:
          'inset 0 1px 0 0 rgb(255 255 255 / 0.06), 0 2px 4px 0 rgb(0 0 0 / 0.3), 0 20px 40px -20px rgb(0 0 0 / 0.8)',
        fab: '0 0 0 6px rgb(var(--canvas)), 0 10px 30px -6px rgb(var(--accent) / 0.55)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
