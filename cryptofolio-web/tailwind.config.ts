import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'app-bg': 'var(--app-bg)',
        'sheet-bg': 'var(--sheet-bg)',
        'card-bg': 'var(--card-bg)',
        'card-bg-hover': 'var(--card-bg-hover)',
        'row-bg': 'var(--row-bg)',
        border: 'var(--border)',
        'border-hover': 'var(--border-hover)',
        'subtle-border': 'var(--subtle-border)',
        'field-bg': 'var(--field-bg)',
        'field-border': 'var(--field-border)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-faint': 'var(--text-faint)',
        gold: 'var(--gold)',
        green: 'var(--green)',
        red: 'var(--red)',
      },
      fontFamily: { mono: 'var(--font-mono)' },
    },
  },
  plugins: [],
} satisfies Config
