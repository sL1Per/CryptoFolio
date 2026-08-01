# CryptoFolio Web — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the static, offline foundation of the CryptoFolio web app — types, constants, theme, Zustand store with holdings CRUD + localStorage persistence, and the full UI (portfolio card, control bar, card grids, add/edit/settings modals) — with **no CoinGecko API calls yet**.

**Architecture:** Vite + React + TypeScript SPA. All portfolio logic lives in a single Zustand store (`persist` middleware → localStorage), a direct port of the SwiftUI `PortfolioViewModel`. Presentational components read the store via selectors and semantic Tailwind classes backed by CSS variables ported from `Theme.swift`. Deployed later to Cloudflare Pages (config scaffolded here, Functions added in Phase 2).

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3, Zustand 4, Lucide React, Vitest + @testing-library/react, Cloudflare Wrangler (config only in this phase).

## Global Constraints

- Location: everything under `cryptofolio-web/` (subfolder of repo root). All paths below are relative to it unless noted.
- Node 20+ (dev machine has v25); npm 11.
- TypeScript strict mode on.
- **No API calls in Phase 1.** `prices`, `coinImages` stay empty; value-dependent UI degrades gracefully (shows `—` / `$0.00`).
- Constants copied **verbatim** from `Models.swift`: exactly 20 coins in `POPULAR_COINS`, exactly 13 exchanges in `EXCHANGES` (ids, names, hex colors without `#`, domains).
- Colors only via CSS variables ported from `Theme.swift` (no hardcoded hex in components except through the variable layer). Gold `#ffc850`, green `#00d97e`, red `#ff4d6d`.
- Currency formatting rule: `maximumFractionDigits = value < 1 ? 6 : 2`.
- Persistence keys: holdings under `cryptofolio_holdings_v2`, currency under `cryptofolio_currency`, appearance under `cryptofolio_appearance` (chart cache key `cryptofolio_chartcache_v1` reserved for Phase 3).
- Commit after every task with the shown message.

---

### Task 1: Scaffold project

**Files:**
- Create: `cryptofolio-web/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `wrangler.toml`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `.gitignore`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Produces: a runnable Vite dev server and a passing Vitest setup that later tasks build on.

- [ ] **Step 1: Create the project directory and package.json**

```bash
mkdir -p cryptofolio-web/src/{components/{portfolio,chart,modals,ui},store,lib,routes,types,styles}
cd cryptofolio-web
```

Create `package.json`:

```json
{
  "name": "cryptofolio-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "pages:dev": "wrangler pages dev -- npm run dev"
  },
  "dependencies": {
    "lucide-react": "^0.454.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4",
    "wrangler": "^3.84.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no error exit.

- [ ] **Step 3: Create config files**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

`src/test-setup.ts`:

```ts
import '@testing-library/jest-dom'
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "functions"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

`postcss.config.js`:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

`tailwind.config.ts`:

```ts
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
```

`.gitignore`:

```
node_modules
dist
.wrangler
*.log
.DS_Store
```

`wrangler.toml`:

```toml
name = "cryptofolio-web"
compatibility_date = "2024-11-01"
pages_build_output_dir = "dist"
```

- [ ] **Step 4: Create index.html and app entry**

`index.html`:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CryptoFolio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`src/App.tsx` (placeholder, replaced in Task 13):

```tsx
export default function App() {
  return <div className="p-8 font-mono text-text-primary">CryptoFolio</div>
}
```

`src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Create a minimal `src/styles/globals.css` (fully populated in Task 5):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Write a smoke test**

`src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run the smoke test — verify it passes**

Run: `npm test`
Expected: 1 passed. (Confirms Vitest + TS + jsdom wiring works.)

- [ ] **Step 7: Verify the dev server boots**

Run: `npm run build`
Expected: `tsc -b` passes and `dist/` is produced with no errors.

- [ ] **Step 8: Commit**

```bash
git add cryptofolio-web
git commit -m "chore: scaffold cryptofolio-web (Vite + React + TS + Tailwind + Vitest)"
```

---

### Task 2: Domain types

**Files:**
- Create: `src/types/index.ts`
- Test: `src/types/index.test.ts`

**Interfaces:**
- Produces: `Coin`, `Exchange`, `Holding`, `AggregatedHolding`, `CoinPrice`, `PortfolioDataPoint`, and the string-union types `Currency`, `TimeRange`, `GroupMode`, `SortMode`, `AppearanceMode`. Also `newHolding(coin, amount, exchangeId): Holding` and `exchangeLogoUrl(domain): string`.

- [ ] **Step 1: Write the failing test**

`src/types/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { newHolding, exchangeLogoUrl } from './index'

describe('newHolding', () => {
  it('assigns a uuid and copies fields', () => {
    const coin = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    const h = newHolding(coin, 1.5, 'coinbase')
    expect(h.id).toMatch(/[0-9a-f-]{36}/)
    expect(h.coin).toEqual(coin)
    expect(h.amount).toBe(1.5)
    expect(h.exchangeId).toBe('coinbase')
  })
})

describe('exchangeLogoUrl', () => {
  it('builds a Google favicon CDN url', () => {
    expect(exchangeLogoUrl('coinbase.com')).toBe(
      'https://www.google.com/s2/favicons?domain=coinbase.com&sz=64',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/types`
Expected: FAIL — cannot find module './index' / exports undefined.

- [ ] **Step 3: Write the implementation**

`src/types/index.ts`:

```ts
export interface Coin {
  id: string
  symbol: string
  name: string
}

export interface Exchange {
  id: string
  name: string
  color: string // hex without '#'
  domain: string
}

export interface Holding {
  id: string
  coin: Coin
  amount: number
  exchangeId: string
}

export interface AggregatedHolding {
  coin: Coin
  totalAmount: number
  breakdown: Array<{ exchange: Exchange; amount: number }>
}

export interface CoinPrice {
  usd: number | null
  eur: number | null
  usd_24h_change: number | null
  eur_24h_change: number | null
}

export interface PortfolioDataPoint {
  date: Date
  value: number
}

export type Currency = 'usd' | 'eur'
export type TimeRange = '7D' | '1M' | '1Y' | '5Y'
export type GroupMode = 'token' | 'exchange' | 'all'
export type SortMode = 'value' | 'name' | 'change'
export type AppearanceMode = 'dark' | 'light' | 'system'

export function newHolding(coin: Coin, amount: number, exchangeId: string): Holding {
  return { id: crypto.randomUUID(), coin, amount, exchangeId }
}

export function exchangeLogoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/types`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/types
git commit -m "feat: domain types ported from Models.swift"
```

---

### Task 3: Constants (coins + exchanges)

**Files:**
- Create: `src/lib/constants.ts`
- Test: `src/lib/constants.test.ts`

**Interfaces:**
- Consumes: `Coin`, `Exchange` from `types`.
- Produces: `POPULAR_COINS: Coin[]` (20 items), `EXCHANGES: Exchange[]` (13 items), `findExchange(id): Exchange`, `CURRENCY_META`, `TIME_RANGE_DAYS`.

- [ ] **Step 1: Write the failing test**

`src/lib/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { POPULAR_COINS, EXCHANGES, findExchange, TIME_RANGE_DAYS } from './constants'

describe('constants', () => {
  it('has exactly 20 popular coins with bitcoin first', () => {
    expect(POPULAR_COINS).toHaveLength(20)
    expect(POPULAR_COINS[0]).toEqual({ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' })
  })

  it('has exactly 13 exchanges including the fallback', () => {
    expect(EXCHANGES).toHaveLength(13)
    expect(EXCHANGES.map((e) => e.id)).toContain('other')
  })

  it('findExchange returns a match or a synthesized fallback', () => {
    expect(findExchange('binance').name).toBe('Binance')
    expect(findExchange('unknown-xyz')).toEqual({
      id: 'unknown-xyz',
      name: 'unknown-xyz',
      color: '666666',
      domain: '',
    })
  })

  it('maps time ranges to CoinGecko day counts', () => {
    expect(TIME_RANGE_DAYS).toEqual({ '7D': 7, '1M': 30, '1Y': 365, '5Y': 1825 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/constants`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/constants.ts`:

```ts
import type { Coin, Exchange, TimeRange } from '../types'

export const POPULAR_COINS: Coin[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos' },
  { id: 'stellar', symbol: 'XLM', name: 'Stellar' },
  { id: 'monero', symbol: 'XMR', name: 'Monero' },
  { id: 'tron', symbol: 'TRX', name: 'TRON' },
  { id: 'the-sandbox', symbol: 'SAND', name: 'The Sandbox' },
  { id: 'decentraland', symbol: 'MANA', name: 'Decentraland' },
  { id: 'aave', symbol: 'AAVE', name: 'Aave' },
]

export const EXCHANGES: Exchange[] = [
  { id: 'coinbase', name: 'Coinbase', color: '0052FF', domain: 'coinbase.com' },
  { id: 'binance', name: 'Binance', color: 'F0B90B', domain: 'binance.com' },
  { id: 'kraken', name: 'Kraken', color: '5741D9', domain: 'kraken.com' },
  { id: 'bybit', name: 'Bybit', color: 'F7A600', domain: 'bybit.com' },
  { id: 'okx', name: 'OKX', color: 'BBBBBB', domain: 'okx.com' },
  { id: 'kucoin', name: 'KuCoin', color: '00A3FF', domain: 'kucoin.com' },
  { id: 'gemini', name: 'Gemini', color: '00DCFA', domain: 'gemini.com' },
  { id: 'bitfinex', name: 'Bitfinex', color: '16B157', domain: 'bitfinex.com' },
  { id: 'bitstamp', name: 'Bitstamp', color: '00A850', domain: 'bitstamp.net' },
  { id: 'crypto_com', name: 'Crypto.com', color: '1199FA', domain: 'crypto.com' },
  { id: 'wallet', name: 'Hardware Wallet', color: 'FF6B35', domain: 'ledger.com' },
  { id: 'metamask', name: 'MetaMask', color: 'E8831D', domain: 'metamask.io' },
  { id: 'other', name: 'Other', color: '666666', domain: '' },
]

export function findExchange(id: string): Exchange {
  return EXCHANGES.find((e) => e.id === id) ?? { id, name: id, color: '666666', domain: '' }
}

export const CURRENCY_META = {
  usd: { code: 'USD', symbol: '$' },
  eur: { code: 'EUR', symbol: '€' },
} as const

export const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '7D': 7,
  '1M': 30,
  '1Y': 365,
  '5Y': 1825,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/constants`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.ts src/lib/constants.test.ts
git commit -m "feat: coin + exchange constants ported from Models.swift"
```

---

### Task 4: Formatters

**Files:**
- Create: `src/lib/formatters.ts`
- Test: `src/lib/formatters.test.ts`

**Interfaces:**
- Consumes: `Currency` from types, `CURRENCY_META` from constants.
- Produces: `formatCurrency(value: number, currency: Currency): string`, `asPercentChange(value: number): string`, `formatAmount(value: number): string`.

- [ ] **Step 1: Write the failing test**

`src/lib/formatters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatCurrency, asPercentChange, formatAmount } from './formatters'

describe('formatCurrency', () => {
  it('uses 2 fraction digits for values >= 1', () => {
    expect(formatCurrency(1234.5, 'usd')).toBe('$1,234.50')
  })
  it('uses up to 6 fraction digits for values < 1', () => {
    expect(formatCurrency(0.0025, 'usd')).toBe('$0.0025')
  })
  it('formats euro', () => {
    expect(formatCurrency(10, 'eur')).toBe('€10.00')
  })
})

describe('asPercentChange', () => {
  it('prefixes + for non-negative', () => {
    expect(asPercentChange(3.456)).toBe('+3.46%')
  })
  it('keeps - for negative', () => {
    expect(asPercentChange(-2)).toBe('-2.00%')
  })
})

describe('formatAmount', () => {
  it('trims trailing zeros', () => {
    expect(formatAmount(1.5)).toBe('1.5')
    expect(formatAmount(2)).toBe('2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/formatters`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/formatters.ts`:

```ts
import type { Currency } from '../types'
import { CURRENCY_META } from './constants'

export function formatCurrency(value: number, currency: Currency): string {
  const { code } = CURRENCY_META[currency]
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value)
}

export function asPercentChange(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function formatAmount(value: number): string {
  return parseFloat(value.toFixed(8)).toString()
}
```

Note: `en-US` locale keeps the `$1,234.50` / `€10.00` grouping shown in tests deterministic across machines.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/formatters`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formatters.ts src/lib/formatters.test.ts
git commit -m "feat: currency + percent formatters"
```

---

### Task 5: Theme CSS variables + theme store

**Files:**
- Create/replace: `src/styles/globals.css`
- Create: `src/store/themeStore.ts`
- Test: `src/store/themeStore.test.ts`

**Interfaces:**
- Consumes: `AppearanceMode` from types.
- Produces: `useThemeStore` with `{ appearance: AppearanceMode, setAppearance(m): void }`, and a module-level `applyAppearance(mode)` that toggles the `.dark` class on `document.documentElement`.

- [ ] **Step 1: Populate globals.css with the ported theme**

`src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --app-bg: #f0f2f5;
  --sheet-bg: #f7f8fa;
  --card-bg: rgba(255, 255, 255, 0.85);
  --card-bg-hover: #e8eaed;
  --row-bg: #ffffff;
  --border: rgba(0, 0, 0, 0.07);
  --border-hover: rgba(255, 200, 80, 0.5);
  --subtle-border: rgba(0, 0, 0, 0.05);
  --text-primary: #111111;
  --text-secondary: #555555;
  --text-tertiary: #999999;
  --text-faint: #cccccc;
  --field-bg: #ffffff;
  --field-border: rgba(0, 0, 0, 0.12);

  --gold: #ffc850;
  --gold-dim: rgba(255, 200, 80, 0.08);
  --gold-border: rgba(255, 200, 80, 0.15);
  --gold-card-bg: rgba(255, 200, 80, 0.05);
  --green: #00d97e;
  --red: #ff4d6d;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}

.dark {
  --app-bg: #080b10;
  --sheet-bg: #0a0d12;
  --card-bg: rgba(255, 255, 255, 0.03);
  --card-bg-hover: rgba(255, 255, 255, 0.06);
  --row-bg: rgba(255, 255, 255, 0.03);
  --border: rgba(255, 255, 255, 0.06);
  --border-hover: rgba(255, 200, 80, 0.15);
  --subtle-border: rgba(255, 255, 255, 0.04);
  --text-primary: #e0e0e0;
  --text-secondary: #888888;
  --text-tertiary: #555555;
  --text-faint: #333333;
  --field-bg: rgba(255, 255, 255, 0.05);
  --field-border: rgba(255, 255, 255, 0.1);
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--app-bg);
  color: var(--text-primary);
  font-family: var(--font-mono);
}
```

- [ ] **Step 2: Write the failing test**

`src/store/themeStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore, applyAppearance } from './themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    useThemeStore.setState({ appearance: 'dark' })
  })

  it('applyAppearance(dark) adds the dark class', () => {
    applyAppearance('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('applyAppearance(light) removes the dark class', () => {
    document.documentElement.classList.add('dark')
    applyAppearance('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setAppearance updates state', () => {
    useThemeStore.getState().setAppearance('light')
    expect(useThemeStore.getState().appearance).toBe('light')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/store/themeStore`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`src/store/themeStore.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppearanceMode } from '../types'

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

export function applyAppearance(mode: AppearanceMode): void {
  const dark = mode === 'dark' || (mode === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

interface ThemeState {
  appearance: AppearanceMode
  setAppearance: (mode: AppearanceMode) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      appearance: 'dark',
      setAppearance: (mode) => {
        applyAppearance(mode)
        set({ appearance: mode })
      },
    }),
    {
      name: 'cryptofolio_appearance',
      onRehydrateStorage: () => (state) => {
        if (state) applyAppearance(state.appearance)
      },
    },
  ),
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/store/themeStore`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/store/themeStore.ts src/store/themeStore.test.ts
git commit -m "feat: theme CSS variables + appearance store"
```

---

### Task 6: Portfolio store (holdings CRUD, persistence, selectors)

**Files:**
- Create: `src/store/portfolioStore.ts`
- Create: `src/store/selectors.ts`
- Test: `src/store/portfolioStore.test.ts`, `src/store/selectors.test.ts`

**Interfaces:**
- Consumes: types, constants, `formatCurrency`.
- Produces:
  - `usePortfolioStore` state: `holdings, groupMode, sortMode, currency, prices, coinImages, isLoading, lastUpdated, errorMessage`.
  - actions: `addHolding(coin, amount, exchangeId)`, `updateHolding(id, amount, exchangeId)`, `removeHolding(id)`, `setGroupMode(m)`, `setSortMode(m)`, `setCurrency(c)`.
  - selectors (pure functions of `PortfolioSnapshot = { holdings, prices, currency, sortMode }`): `priceFor(snap, coinId)`, `dailyChangeFor(snap, coinId)`, `totalValue(snap)`, `totalChange24h(snap)`, `sortedHoldings(snap)`, `holdingsByToken(snap)`, `holdingsByExchange(snap)`.
- Note: `prices`/`coinImages` remain empty in Phase 1; `fetchPrices` is added in Phase 2. Selectors must treat a missing price as `0` (value) and `undefined` (change), matching Swift `?? 0`.

- [ ] **Step 1: Write the failing selectors test**

`src/store/selectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  priceFor,
  totalValue,
  totalChange24h,
  sortedHoldings,
  holdingsByToken,
  holdingsByExchange,
  type PortfolioSnapshot,
} from './selectors'
import type { Holding } from '../types'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const eth = { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

function hold(coin: typeof btc, amount: number, ex: string): Holding {
  return { id: `${coin.id}-${ex}`, coin, amount, exchangeId: ex }
}

const snap: PortfolioSnapshot = {
  currency: 'usd',
  sortMode: 'value',
  holdings: [hold(btc, 1, 'coinbase'), hold(btc, 0.5, 'kraken'), hold(eth, 10, 'coinbase')],
  prices: {
    bitcoin: { usd: 100, eur: 90, usd_24h_change: 2, eur_24h_change: 1 },
    ethereum: { usd: 5, eur: 4, usd_24h_change: -3, eur_24h_change: -2 },
  },
}

describe('selectors', () => {
  it('priceFor reads the active currency', () => {
    expect(priceFor(snap, 'bitcoin')).toBe(100)
    expect(priceFor({ ...snap, currency: 'eur' }, 'bitcoin')).toBe(90)
  })

  it('totalValue sums price * amount', () => {
    // btc: 1.5 * 100 = 150 ; eth: 10 * 5 = 50
    expect(totalValue(snap)).toBe(200)
  })

  it('totalChange24h sums weighted daily change', () => {
    // btc: 100*1.5*2/100 = 3 ; eth: 5*10*-3/100 = -1.5
    expect(totalChange24h(snap)).toBeCloseTo(1.5)
  })

  it('sortedHoldings by value is descending', () => {
    const s = sortedHoldings(snap).map((h) => h.id)
    // btc-coinbase 100 > btc-kraken 50 > eth-coinbase 50 (stable)
    expect(s[0]).toBe('bitcoin-coinbase')
  })

  it('holdingsByToken aggregates amounts + breakdown', () => {
    const t = holdingsByToken(snap)
    const btcAgg = t.find((a) => a.coin.id === 'bitcoin')!
    expect(btcAgg.totalAmount).toBe(1.5)
    expect(btcAgg.breakdown).toHaveLength(2)
  })

  it('holdingsByExchange groups + totals, sorted desc', () => {
    const g = holdingsByExchange(snap)
    // coinbase: btc 100 + eth 50 = 150 ; kraken: btc 50
    expect(g[0].exchange.id).toBe('coinbase')
    expect(g[0].totalValue).toBe(150)
  })

  it('treats missing prices as zero', () => {
    const empty: PortfolioSnapshot = { ...snap, prices: {} }
    expect(totalValue(empty)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/store/selectors`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the selectors implementation**

`src/store/selectors.ts`:

```ts
import type {
  AggregatedHolding,
  CoinPrice,
  Currency,
  Exchange,
  Holding,
  SortMode,
} from '../types'
import { findExchange } from '../lib/constants'

export interface PortfolioSnapshot {
  holdings: Holding[]
  prices: Record<string, CoinPrice>
  currency: Currency
  sortMode: SortMode
}

export function priceFor(snap: PortfolioSnapshot, coinId: string): number | undefined {
  const p = snap.prices[coinId]
  if (!p) return undefined
  return (snap.currency === 'usd' ? p.usd : p.eur) ?? undefined
}

export function dailyChangeFor(snap: PortfolioSnapshot, coinId: string): number | undefined {
  const p = snap.prices[coinId]
  if (!p) return undefined
  return (snap.currency === 'usd' ? p.usd_24h_change : p.eur_24h_change) ?? undefined
}

export function totalValue(snap: PortfolioSnapshot): number {
  return snap.holdings.reduce((sum, h) => sum + (priceFor(snap, h.coin.id) ?? 0) * h.amount, 0)
}

export function totalChange24h(snap: PortfolioSnapshot): number {
  return snap.holdings.reduce((sum, h) => {
    const p = priceFor(snap, h.coin.id) ?? 0
    const c = dailyChangeFor(snap, h.coin.id) ?? 0
    return sum + (p * h.amount * c) / 100
  }, 0)
}

function compare(snap: PortfolioSnapshot, aId: string, aAmt: number, aName: string, bId: string, bAmt: number, bName: string): number {
  switch (snap.sortMode) {
    case 'value':
      return (priceFor(snap, bId) ?? 0) * bAmt - (priceFor(snap, aId) ?? 0) * aAmt
    case 'name':
      return aName.localeCompare(bName)
    case 'change':
      return (dailyChangeFor(snap, bId) ?? 0) - (dailyChangeFor(snap, aId) ?? 0)
  }
}

export function sortedHoldings(snap: PortfolioSnapshot): Holding[] {
  return [...snap.holdings].sort((a, b) =>
    compare(snap, a.coin.id, a.amount, a.coin.name, b.coin.id, b.amount, b.coin.name),
  )
}

export function holdingsByToken(snap: PortfolioSnapshot): AggregatedHolding[] {
  const map = new Map<string, AggregatedHolding>()
  for (const h of snap.holdings) {
    const existing = map.get(h.coin.id)
    const entry = { exchange: findExchange(h.exchangeId), amount: h.amount }
    if (existing) {
      existing.totalAmount += h.amount
      existing.breakdown.push(entry)
    } else {
      map.set(h.coin.id, { coin: h.coin, totalAmount: h.amount, breakdown: [entry] })
    }
  }
  return [...map.values()].sort((a, b) =>
    compare(snap, a.coin.id, a.totalAmount, a.coin.name, b.coin.id, b.totalAmount, b.coin.name),
  )
}

export interface ExchangeGroup {
  exchange: Exchange
  holdings: Holding[]
  totalValue: number
}

export function holdingsByExchange(snap: PortfolioSnapshot): ExchangeGroup[] {
  const ids = [...new Set(snap.holdings.map((h) => h.exchangeId))]
  const sorted = sortedHoldings(snap)
  return ids
    .map((exId) => {
      const holdings = sorted.filter((h) => h.exchangeId === exId)
      const total = holdings.reduce((s, h) => s + (priceFor(snap, h.coin.id) ?? 0) * h.amount, 0)
      return { exchange: findExchange(exId), holdings, totalValue: total }
    })
    .sort((a, b) => b.totalValue - a.totalValue)
}
```

- [ ] **Step 4: Run selectors test — verify pass**

Run: `npm test -- src/store/selectors`
Expected: 7 passed.

- [ ] **Step 5: Write the failing store test**

`src/store/portfolioStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { usePortfolioStore } from './portfolioStore'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

describe('portfolioStore', () => {
  beforeEach(() => {
    localStorage.clear()
    usePortfolioStore.setState({ holdings: [], currency: 'usd', groupMode: 'token', sortMode: 'value' })
  })

  it('addHolding appends a holding', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    expect(usePortfolioStore.getState().holdings).toHaveLength(1)
    expect(usePortfolioStore.getState().holdings[0].amount).toBe(2)
  })

  it('updateHolding changes amount + exchange', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    const id = usePortfolioStore.getState().holdings[0].id
    usePortfolioStore.getState().updateHolding(id, 5, 'kraken')
    const h = usePortfolioStore.getState().holdings[0]
    expect(h.amount).toBe(5)
    expect(h.exchangeId).toBe('kraken')
  })

  it('removeHolding deletes by id', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    const id = usePortfolioStore.getState().holdings[0].id
    usePortfolioStore.getState().removeHolding(id)
    expect(usePortfolioStore.getState().holdings).toHaveLength(0)
  })

  it('persists holdings to localStorage', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    expect(localStorage.getItem('cryptofolio_holdings_v2')).toContain('bitcoin')
  })
})
```

- [ ] **Step 6: Run store test — verify it fails**

Run: `npm test -- src/store/portfolioStore`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the store implementation**

`src/store/portfolioStore.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Coin, CoinPrice, Currency, GroupMode, Holding, SortMode } from '../types'
import { newHolding } from '../types'

interface PortfolioState {
  holdings: Holding[]
  groupMode: GroupMode
  sortMode: SortMode
  currency: Currency

  // Live-data fields (populated in Phase 2; empty here)
  prices: Record<string, CoinPrice>
  coinImages: Record<string, string>
  isLoading: boolean
  lastUpdated: number | null
  errorMessage: string | null

  addHolding: (coin: Coin, amount: number, exchangeId: string) => void
  updateHolding: (id: string, amount: number, exchangeId: string) => void
  removeHolding: (id: string) => void
  setGroupMode: (mode: GroupMode) => void
  setSortMode: (mode: SortMode) => void
  setCurrency: (currency: Currency) => void
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set) => ({
      holdings: [],
      groupMode: 'token',
      sortMode: 'value',
      currency: 'usd',
      prices: {},
      coinImages: {},
      isLoading: false,
      lastUpdated: null,
      errorMessage: null,

      addHolding: (coin, amount, exchangeId) =>
        set((s) => ({ holdings: [...s.holdings, newHolding(coin, amount, exchangeId)] })),

      updateHolding: (id, amount, exchangeId) =>
        set((s) => ({
          holdings: s.holdings.map((h) => (h.id === id ? { ...h, amount, exchangeId } : h)),
        })),

      removeHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),

      setGroupMode: (groupMode) => set({ groupMode }),
      setSortMode: (sortMode) => set({ sortMode }),
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: 'cryptofolio_holdings_v2',
      partialize: (s) => ({
        holdings: s.holdings,
        currency: s.currency,
        groupMode: s.groupMode,
        sortMode: s.sortMode,
      }),
    },
  ),
)
```

Note: `partialize` restricts persistence to durable fields; `prices`/`coinImages` are never persisted (they'll be re-fetched in Phase 2). The persist `name` matches the Swift holdings key for continuity of intent.

- [ ] **Step 8: Run store test — verify pass**

Run: `npm test -- src/store/portfolioStore`
Expected: 4 passed.

- [ ] **Step 9: Commit**

```bash
git add src/store/portfolioStore.ts src/store/selectors.ts src/store/portfolioStore.test.ts src/store/selectors.test.ts
git commit -m "feat: portfolio store (CRUD + persist) and pure selectors"
```

---

### Task 7: UI primitives

**Files:**
- Create: `src/components/ui/CoinImage.tsx`, `src/components/ui/ExchangeBadge.tsx`, `src/components/ui/ChangeBadge.tsx`, `src/components/ui/SectionHeader.tsx`
- Test: `src/components/ui/CoinImage.test.tsx`, `src/components/ui/ChangeBadge.test.tsx`

**Interfaces:**
- Consumes: `Coin`, `Exchange`, `exchangeLogoUrl`, `asPercentChange`.
- Produces:
  - `CoinImage({ coin, imageUrl?, size? })` — `<img>` with letter-avatar fallback on error.
  - `ExchangeBadge({ exchange, size? })` — favicon with colored fallback dot.
  - `ChangeBadge({ change })` — green/red text via `asPercentChange`, `—` when `undefined`.
  - `SectionHeader({ children })`.

- [ ] **Step 1: Write the failing tests**

`src/components/ui/ChangeBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChangeBadge } from './ChangeBadge'

describe('ChangeBadge', () => {
  it('renders a dash when change is undefined', () => {
    render(<ChangeBadge change={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
  it('renders +2.00% for positive change', () => {
    render(<ChangeBadge change={2} />)
    expect(screen.getByText('+2.00%')).toBeInTheDocument()
  })
})
```

`src/components/ui/CoinImage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoinImage } from './CoinImage'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

describe('CoinImage', () => {
  it('shows the image when a url is provided', () => {
    render(<CoinImage coin={btc} imageUrl="https://example.com/btc.png" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/btc.png')
  })
  it('falls back to the first letter on image error', () => {
    render(<CoinImage coin={btc} imageUrl="https://bad/url.png" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('B')).toBeInTheDocument()
  })
  it('shows the letter avatar when no url is provided', () => {
    render(<CoinImage coin={btc} />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/ui`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the primitives**

`src/components/ui/CoinImage.tsx`:

```tsx
import { useState } from 'react'
import type { Coin } from '../../types'

export function CoinImage({ coin, imageUrl, size = 32 }: { coin: Coin; imageUrl?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }

  if (!imageUrl || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-card-bg-hover text-text-secondary font-mono"
        style={{ ...style, fontSize: size * 0.45 }}
      >
        {coin.symbol.charAt(0)}
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      alt={coin.name}
      style={style}
      className="rounded-full"
      onError={() => setFailed(true)}
    />
  )
}
```

`src/components/ui/ExchangeBadge.tsx`:

```tsx
import { useState } from 'react'
import type { Exchange } from '../../types'
import { exchangeLogoUrl } from '../../types'

export function ExchangeBadge({ exchange, size = 16 }: { exchange: Exchange; size?: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }

  if (!exchange.domain || failed) {
    return <span className="inline-block rounded-full" style={{ ...style, background: `#${exchange.color}` }} />
  }
  return (
    <img
      src={exchangeLogoUrl(exchange.domain)}
      alt={exchange.name}
      style={style}
      className="rounded-sm"
      onError={() => setFailed(true)}
    />
  )
}
```

`src/components/ui/ChangeBadge.tsx`:

```tsx
import { asPercentChange } from '../../lib/formatters'

export function ChangeBadge({ change }: { change: number | undefined }) {
  if (change === undefined) return <span className="text-text-tertiary">—</span>
  return <span className={change >= 0 ? 'text-green' : 'text-red'}>{asPercentChange(change)}</span>
}
```

`src/components/ui/SectionHeader.tsx`:

```tsx
import type { ReactNode } from 'react'

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 py-2 text-xs uppercase tracking-wider text-text-tertiary font-mono">
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/ui`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui
git commit -m "feat: UI primitives (CoinImage, ExchangeBadge, ChangeBadge, SectionHeader)"
```

---

### Task 8: TotalPortfolioCard

**Files:**
- Create: `src/components/portfolio/TotalPortfolioCard.tsx`
- Test: `src/components/portfolio/TotalPortfolioCard.test.tsx`

**Interfaces:**
- Consumes: `usePortfolioStore`, selectors `totalValue`/`totalChange24h`, `formatCurrency`, `asPercentChange`.
- Produces: `TotalPortfolioCard()` — reads store directly; shows total value, absolute 24h change, and percent, colored green/red.

- [ ] **Step 1: Write the failing test**

`src/components/portfolio/TotalPortfolioCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TotalPortfolioCard } from './TotalPortfolioCard'
import { usePortfolioStore } from '../../store/portfolioStore'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

describe('TotalPortfolioCard', () => {
  beforeEach(() => {
    usePortfolioStore.setState({
      holdings: [{ id: 'a', coin: btc, amount: 2, exchangeId: 'coinbase' }],
      prices: { bitcoin: { usd: 100, eur: 90, usd_24h_change: 5, eur_24h_change: 4 } },
      currency: 'usd',
    })
  })

  it('shows the total portfolio value', () => {
    render(<TotalPortfolioCard />)
    expect(screen.getByText('$200.00')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TotalPortfolioCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/components/portfolio/TotalPortfolioCard.tsx`:

```tsx
import { usePortfolioStore } from '../../store/portfolioStore'
import { totalValue, totalChange24h, type PortfolioSnapshot } from '../../store/selectors'
import { formatCurrency, asPercentChange } from '../../lib/formatters'

export function TotalPortfolioCard() {
  const snap = usePortfolioStore(
    (s): PortfolioSnapshot => ({
      holdings: s.holdings,
      prices: s.prices,
      currency: s.currency,
      sortMode: s.sortMode,
    }),
  )
  const total = totalValue(snap)
  const change = totalChange24h(snap)
  const pct = total - change !== 0 ? (change / (total - change)) * 100 : 0
  const up = change >= 0

  return (
    <div className="rounded-2xl border border-gold-border bg-[var(--gold-card-bg)] p-6">
      <div className="text-xs uppercase tracking-wider text-text-secondary">Total Portfolio Value</div>
      <div className="mt-2 text-4xl font-semibold text-text-primary">{formatCurrency(total, snap.currency)}</div>
      <div className={`mt-1 text-sm ${up ? 'text-green' : 'text-red'}`}>
        {up ? '+' : ''}
        {formatCurrency(change, snap.currency)} ({asPercentChange(pct)}) 24h
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TotalPortfolioCard`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/portfolio/TotalPortfolioCard.tsx src/components/portfolio/TotalPortfolioCard.test.tsx
git commit -m "feat: TotalPortfolioCard"
```

---

### Task 9: ControlBar (group / sort / currency)

**Files:**
- Create: `src/components/ui/SegmentedControl.tsx`, `src/components/portfolio/ControlBar.tsx`
- Test: `src/components/portfolio/ControlBar.test.tsx`

**Interfaces:**
- Consumes: `usePortfolioStore` (groupMode/sortMode/currency + setters).
- Produces:
  - `SegmentedControl<T>({ options, value, onChange })` where `options: {value: T, label: string}[]`.
  - `ControlBar()` — three segmented controls wired to the store.

- [ ] **Step 1: Write the failing test**

`src/components/portfolio/ControlBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlBar } from './ControlBar'
import { usePortfolioStore } from '../../store/portfolioStore'

describe('ControlBar', () => {
  beforeEach(() => {
    usePortfolioStore.setState({ groupMode: 'token', sortMode: 'value', currency: 'usd' })
  })

  it('switches group mode on click', async () => {
    render(<ControlBar />)
    await userEvent.click(screen.getByRole('button', { name: 'Exchange' }))
    expect(usePortfolioStore.getState().groupMode).toBe('exchange')
  })

  it('switches currency on click', async () => {
    render(<ControlBar />)
    await userEvent.click(screen.getByRole('button', { name: 'EUR' }))
    expect(usePortfolioStore.getState().currency).toBe('eur')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ControlBar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SegmentedControl**

`src/components/ui/SegmentedControl.tsx`:

```tsx
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card-bg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1 text-xs font-mono transition-colors ${
            value === opt.value ? 'bg-[var(--gold-card-bg)] text-gold' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement ControlBar**

`src/components/portfolio/ControlBar.tsx`:

```tsx
import { usePortfolioStore } from '../../store/portfolioStore'
import { SegmentedControl } from '../ui/SegmentedControl'
import type { Currency, GroupMode, SortMode } from '../../types'

const GROUPS: { value: GroupMode; label: string }[] = [
  { value: 'token', label: 'Token' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'all', label: 'All' },
]
const SORTS: { value: SortMode; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'name', label: 'Name' },
  { value: 'change', label: '24h Change' },
]
const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'usd', label: 'USD' },
  { value: 'eur', label: 'EUR' },
]

export function ControlBar() {
  const { groupMode, sortMode, currency, setGroupMode, setSortMode, setCurrency } = usePortfolioStore()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl options={GROUPS} value={groupMode} onChange={setGroupMode} />
      <SegmentedControl options={SORTS} value={sortMode} onChange={setSortMode} />
      <div className="ml-auto">
        <SegmentedControl options={CURRENCIES} value={currency} onChange={setCurrency} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- ControlBar`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SegmentedControl.tsx src/components/portfolio/ControlBar.tsx src/components/portfolio/ControlBar.test.tsx
git commit -m "feat: ControlBar + SegmentedControl"
```

---

### Task 10: HoldingCard + TokenCard

**Files:**
- Create: `src/components/portfolio/HoldingCard.tsx`, `src/components/portfolio/TokenCard.tsx`
- Test: `src/components/portfolio/TokenCard.test.tsx`

**Interfaces:**
- Consumes: selectors `priceFor`/`dailyChangeFor`, `formatCurrency`, `formatAmount`, `CoinImage`, `ExchangeBadge`, `ChangeBadge`, `findExchange`.
- Produces:
  - `HoldingCard({ holding, snap, imageUrl, onClick? })` — one exchange-specific holding (coin image, symbol, exchange badge, amount, value, 24h change).
  - `TokenCard({ agg, snap, imageUrl, onClick })` — aggregated-by-token card; `onClick` opens breakdown modal.

- [ ] **Step 1: Write the failing test**

`src/components/portfolio/TokenCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TokenCard } from './TokenCard'
import type { PortfolioSnapshot } from '../../store/selectors'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const snap: PortfolioSnapshot = {
  currency: 'usd',
  sortMode: 'value',
  holdings: [],
  prices: { bitcoin: { usd: 100, eur: 90, usd_24h_change: 5, eur_24h_change: 4 } },
}
const agg = {
  coin: btc,
  totalAmount: 2,
  breakdown: [{ exchange: { id: 'coinbase', name: 'Coinbase', color: '0052FF', domain: 'coinbase.com' }, amount: 2 }],
}

describe('TokenCard', () => {
  it('shows symbol and value and fires onClick', async () => {
    let clicked = false
    render(<TokenCard agg={agg} snap={snap} onClick={() => (clicked = true)} />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('$200.00')).toBeInTheDocument()
    await userEvent.click(screen.getByText('BTC'))
    expect(clicked).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TokenCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HoldingCard**

`src/components/portfolio/HoldingCard.tsx`:

```tsx
import type { Holding } from '../../types'
import { findExchange } from '../../lib/constants'
import { priceFor, dailyChangeFor, type PortfolioSnapshot } from '../../store/selectors'
import { formatCurrency, formatAmount } from '../../lib/formatters'
import { CoinImage } from '../ui/CoinImage'
import { ExchangeBadge } from '../ui/ExchangeBadge'
import { ChangeBadge } from '../ui/ChangeBadge'

export function HoldingCard({
  holding,
  snap,
  imageUrl,
  onClick,
}: {
  holding: Holding
  snap: PortfolioSnapshot
  imageUrl?: string
  onClick?: () => void
}) {
  const price = priceFor(snap, holding.coin.id) ?? 0
  const value = price * holding.amount
  const exchange = findExchange(holding.exchangeId)
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card-bg p-4 text-left transition-colors hover:border-border-hover hover:bg-card-bg-hover"
    >
      <div className="flex items-center gap-2">
        <CoinImage coin={holding.coin} imageUrl={imageUrl} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">{holding.coin.symbol}</span>
          <span className="flex items-center gap-1 text-xs text-text-tertiary">
            <ExchangeBadge exchange={exchange} /> {exchange.name}
          </span>
        </div>
        <div className="ml-auto text-xs">
          <ChangeBadge change={dailyChangeFor(snap, holding.coin.id)} />
        </div>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-secondary">{formatAmount(holding.amount)} {holding.coin.symbol}</span>
        <span className="text-sm font-semibold text-text-primary">{formatCurrency(value, snap.currency)}</span>
      </div>
    </button>
  )
}
```

- [ ] **Step 4: Implement TokenCard**

`src/components/portfolio/TokenCard.tsx`:

```tsx
import type { AggregatedHolding } from '../../types'
import { priceFor, dailyChangeFor, type PortfolioSnapshot } from '../../store/selectors'
import { formatCurrency, formatAmount } from '../../lib/formatters'
import { CoinImage } from '../ui/CoinImage'
import { ChangeBadge } from '../ui/ChangeBadge'

export function TokenCard({
  agg,
  snap,
  imageUrl,
  onClick,
}: {
  agg: AggregatedHolding
  snap: PortfolioSnapshot
  imageUrl?: string
  onClick: () => void
}) {
  const price = priceFor(snap, agg.coin.id) ?? 0
  const value = price * agg.totalAmount
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card-bg p-4 text-left transition-colors hover:border-border-hover hover:bg-card-bg-hover"
    >
      <div className="flex items-center gap-2">
        <CoinImage coin={agg.coin} imageUrl={imageUrl} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">{agg.coin.symbol}</span>
          <span className="text-xs text-text-tertiary">{agg.breakdown.length} location{agg.breakdown.length > 1 ? 's' : ''}</span>
        </div>
        <div className="ml-auto text-xs">
          <ChangeBadge change={dailyChangeFor(snap, agg.coin.id)} />
        </div>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-secondary">{formatAmount(agg.totalAmount)} {agg.coin.symbol}</span>
        <span className="text-sm font-semibold text-text-primary">{formatCurrency(value, snap.currency)}</span>
      </div>
    </button>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- TokenCard`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/portfolio/HoldingCard.tsx src/components/portfolio/TokenCard.tsx src/components/portfolio/TokenCard.test.tsx
git commit -m "feat: HoldingCard + TokenCard"
```

---

### Task 11: Grids + TokenBreakdownModal

**Files:**
- Create: `src/components/portfolio/FlatHoldingsGrid.tsx`, `src/components/portfolio/TokenGroupedGrid.tsx`, `src/components/portfolio/ExchangeGroupedGrid.tsx`, `src/components/portfolio/TokenBreakdownModal.tsx`, `src/components/ui/Modal.tsx`
- Test: `src/components/portfolio/TokenGroupedGrid.test.tsx`

**Interfaces:**
- Consumes: selectors `sortedHoldings`/`holdingsByToken`/`holdingsByExchange`, cards from Task 10, `usePortfolioStore` (for `coinImages`).
- Produces:
  - `Modal({ open, onClose, title, children })` — accessible `<dialog>`-style overlay.
  - `FlatHoldingsGrid()`, `TokenGroupedGrid()`, `ExchangeGroupedGrid()` — each reads the store, builds its snapshot, renders a 2-col (1-col mobile) grid.
  - `TokenBreakdownModal({ agg, snap, open, onClose })`.

- [ ] **Step 1: Write the failing test**

`src/components/portfolio/TokenGroupedGrid.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokenGroupedGrid } from './TokenGroupedGrid'
import { usePortfolioStore } from '../../store/portfolioStore'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const eth = { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

describe('TokenGroupedGrid', () => {
  beforeEach(() => {
    usePortfolioStore.setState({
      holdings: [
        { id: 'a', coin: btc, amount: 1, exchangeId: 'coinbase' },
        { id: 'b', coin: eth, amount: 5, exchangeId: 'kraken' },
      ],
      prices: {
        bitcoin: { usd: 100, eur: 90, usd_24h_change: 1, eur_24h_change: 1 },
        ethereum: { usd: 10, eur: 9, usd_24h_change: 1, eur_24h_change: 1 },
      },
      currency: 'usd',
      sortMode: 'value',
      coinImages: {},
    })
  })

  it('renders one card per token', () => {
    render(<TokenGroupedGrid />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TokenGroupedGrid`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Modal**

`src/components/ui/Modal.tsx`:

```tsx
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-border bg-sheet-bg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-primary">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-text-tertiary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement the snapshot hook + grids + breakdown modal**

`src/components/portfolio/useSnapshot.ts`:

```ts
import { usePortfolioStore } from '../../store/portfolioStore'
import type { PortfolioSnapshot } from '../../store/selectors'

export function useSnapshot(): PortfolioSnapshot {
  return usePortfolioStore((s) => ({
    holdings: s.holdings,
    prices: s.prices,
    currency: s.currency,
    sortMode: s.sortMode,
  }))
}
```

`src/components/portfolio/TokenBreakdownModal.tsx`:

```tsx
import type { AggregatedHolding } from '../../types'
import type { PortfolioSnapshot } from '../../store/selectors'
import { priceFor } from '../../store/selectors'
import { formatCurrency, formatAmount } from '../../lib/formatters'
import { ExchangeBadge } from '../ui/ExchangeBadge'
import { Modal } from '../ui/Modal'

export function TokenBreakdownModal({
  agg,
  snap,
  open,
  onClose,
}: {
  agg: AggregatedHolding | null
  snap: PortfolioSnapshot
  open: boolean
  onClose: () => void
}) {
  if (!agg) return null
  const price = priceFor(snap, agg.coin.id) ?? 0
  return (
    <Modal open={open} onClose={onClose} title={`${agg.coin.name} breakdown`}>
      <div className="flex flex-col gap-2">
        {agg.breakdown.map((b, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-subtle-border bg-row-bg p-3">
            <span className="flex items-center gap-2 text-sm text-text-primary">
              <ExchangeBadge exchange={b.exchange} /> {b.exchange.name}
            </span>
            <span className="text-xs text-text-secondary">{formatAmount(b.amount)} {agg.coin.symbol}</span>
            <span className="text-sm font-semibold text-text-primary">{formatCurrency(price * b.amount, snap.currency)}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
```

`src/components/portfolio/TokenGroupedGrid.tsx`:

```tsx
import { useState } from 'react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { holdingsByToken } from '../../store/selectors'
import { useSnapshot } from './useSnapshot'
import { TokenCard } from './TokenCard'
import { TokenBreakdownModal } from './TokenBreakdownModal'
import type { AggregatedHolding } from '../../types'

export function TokenGroupedGrid() {
  const snap = useSnapshot()
  const coinImages = usePortfolioStore((s) => s.coinImages)
  const [selected, setSelected] = useState<AggregatedHolding | null>(null)
  const tokens = holdingsByToken(snap)

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tokens.map((agg) => (
          <TokenCard key={agg.coin.id} agg={agg} snap={snap} imageUrl={coinImages[agg.coin.id]} onClick={() => setSelected(agg)} />
        ))}
      </div>
      <TokenBreakdownModal agg={selected} snap={snap} open={selected !== null} onClose={() => setSelected(null)} />
    </>
  )
}
```

`src/components/portfolio/FlatHoldingsGrid.tsx`:

```tsx
import { usePortfolioStore } from '../../store/portfolioStore'
import { sortedHoldings } from '../../store/selectors'
import { useSnapshot } from './useSnapshot'
import { HoldingCard } from './HoldingCard'

export function FlatHoldingsGrid() {
  const snap = useSnapshot()
  const coinImages = usePortfolioStore((s) => s.coinImages)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sortedHoldings(snap).map((h) => (
        <HoldingCard key={h.id} holding={h} snap={snap} imageUrl={coinImages[h.coin.id]} />
      ))}
    </div>
  )
}
```

`src/components/portfolio/ExchangeGroupedGrid.tsx`:

```tsx
import { usePortfolioStore } from '../../store/portfolioStore'
import { holdingsByExchange } from '../../store/selectors'
import { useSnapshot } from './useSnapshot'
import { HoldingCard } from './HoldingCard'
import { ExchangeBadge } from '../ui/ExchangeBadge'
import { SectionHeader } from '../ui/SectionHeader'
import { formatCurrency } from '../../lib/formatters'

export function ExchangeGroupedGrid() {
  const snap = useSnapshot()
  const coinImages = usePortfolioStore((s) => s.coinImages)
  return (
    <div className="flex flex-col gap-4">
      {holdingsByExchange(snap).map((group) => (
        <div key={group.exchange.id}>
          <SectionHeader>
            <span className="flex items-center gap-2">
              <ExchangeBadge exchange={group.exchange} /> {group.exchange.name} · {formatCurrency(group.totalValue, snap.currency)}
            </span>
          </SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.holdings.map((h) => (
              <HoldingCard key={h.id} holding={h} snap={snap} imageUrl={coinImages[h.coin.id]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- TokenGroupedGrid`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/portfolio/FlatHoldingsGrid.tsx src/components/portfolio/TokenGroupedGrid.tsx src/components/portfolio/ExchangeGroupedGrid.tsx src/components/portfolio/TokenBreakdownModal.tsx src/components/portfolio/useSnapshot.ts src/components/ui/Modal.tsx src/components/portfolio/TokenGroupedGrid.test.tsx
git commit -m "feat: holdings grids (flat/token/exchange) + breakdown modal"
```

---

### Task 12: AddHoldingModal + SettingsModal

**Files:**
- Create: `src/components/modals/AddHoldingModal.tsx`, `src/components/modals/SettingsModal.tsx`
- Test: `src/components/modals/AddHoldingModal.test.tsx`

**Interfaces:**
- Consumes: `usePortfolioStore` (addHolding/updateHolding/removeHolding), `useThemeStore`, `POPULAR_COINS`, `EXCHANGES`, `Modal`.
- Produces:
  - `AddHoldingModal({ open, onClose, editing? })` — coin picker (searchable select over `POPULAR_COINS`), amount input, exchange picker; Save calls add or update; Delete (edit mode) removes.
  - `SettingsModal({ open, onClose })` — currency + appearance segmented controls, credits line.

- [ ] **Step 1: Write the failing test**

`src/components/modals/AddHoldingModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddHoldingModal } from './AddHoldingModal'
import { usePortfolioStore } from '../../store/portfolioStore'

describe('AddHoldingModal', () => {
  beforeEach(() => {
    usePortfolioStore.setState({ holdings: [] })
  })

  it('adds a holding on save', async () => {
    render(<AddHoldingModal open onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Coin'), 'bitcoin')
    await userEvent.type(screen.getByLabelText('Amount'), '1.25')
    await userEvent.selectOptions(screen.getByLabelText('Exchange'), 'kraken')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const h = usePortfolioStore.getState().holdings
    expect(h).toHaveLength(1)
    expect(h[0].coin.id).toBe('bitcoin')
    expect(h[0].amount).toBe(1.25)
    expect(h[0].exchangeId).toBe('kraken')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AddHoldingModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AddHoldingModal**

`src/components/modals/AddHoldingModal.tsx`:

```tsx
import { useState } from 'react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { POPULAR_COINS, EXCHANGES } from '../../lib/constants'
import { Modal } from '../ui/Modal'
import type { Holding } from '../../types'

export function AddHoldingModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing?: Holding
}) {
  const { addHolding, updateHolding, removeHolding } = usePortfolioStore()
  const [coinId, setCoinId] = useState(editing?.coin.id ?? POPULAR_COINS[0].id)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [exchangeId, setExchangeId] = useState(editing?.exchangeId ?? EXCHANGES[0].id)

  const fieldClass = 'w-full rounded-lg border border-field-border bg-field-bg px-3 py-2 text-sm text-text-primary font-mono'

  function save() {
    const coin = POPULAR_COINS.find((c) => c.id === coinId)!
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    if (editing) updateHolding(editing.id, amt, exchangeId)
    else addHolding(coin, amt, exchangeId)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Holding' : 'Add Holding'}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Coin
          <select aria-label="Coin" className={fieldClass} value={coinId} onChange={(e) => setCoinId(e.target.value)} disabled={!!editing}>
            {POPULAR_COINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Amount
          <input aria-label="Amount" className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Exchange
          <select aria-label="Exchange" className={fieldClass} value={exchangeId} onChange={(e) => setExchangeId(e.target.value)}>
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </label>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={save} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-black">Save</button>
          {editing && (
            <button
              onClick={() => {
                removeHolding(editing.id)
                onClose()
              }}
              className="rounded-lg border border-red px-4 py-2 text-sm text-red"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Implement SettingsModal**

`src/components/modals/SettingsModal.tsx`:

```tsx
import { usePortfolioStore } from '../../store/portfolioStore'
import { useThemeStore } from '../../store/themeStore'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import type { AppearanceMode, Currency } from '../../types'

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'usd', label: 'USD' },
  { value: 'eur', label: 'EUR' },
]
const APPEARANCES: { value: AppearanceMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currency, setCurrency } = usePortfolioStore()
  const { appearance, setAppearance } = useThemeStore()
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Currency</span>
          <SegmentedControl options={CURRENCIES} value={currency} onChange={setCurrency} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Appearance</span>
          <SegmentedControl options={APPEARANCES} value={appearance} onChange={setAppearance} />
        </div>
        <p className="pt-2 text-center text-xs text-text-tertiary">Made with ♥ by Pedro Viegas and Claude.ai — 2026</p>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- AddHoldingModal`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals
git commit -m "feat: AddHoldingModal + SettingsModal"
```

---

### Task 13: PortfolioPage + App shell + routing

**Files:**
- Create: `src/routes/PortfolioPage.tsx`, `src/components/layout/AppShell.tsx`
- Replace: `src/App.tsx`
- Test: `src/routes/PortfolioPage.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `AppShell({ children })` — top bar (title + Add + Settings buttons), max-width container.
  - `PortfolioPage()` — TotalPortfolioCard, ControlBar, and the grid chosen by `groupMode`; empty state when no holdings; hosts AddHoldingModal + SettingsModal.
  - `App()` — Router with `/` → PortfolioPage. (`/chart` route reserved for Phase 3.)

- [ ] **Step 1: Write the failing test**

`src/routes/PortfolioPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PortfolioPage } from './PortfolioPage'
import { usePortfolioStore } from '../store/portfolioStore'

describe('PortfolioPage', () => {
  beforeEach(() => {
    usePortfolioStore.setState({ holdings: [], groupMode: 'token', prices: {}, coinImages: {} })
  })

  it('shows an empty state when there are no holdings', () => {
    render(<PortfolioPage />)
    expect(screen.getByText(/no holdings/i)).toBeInTheDocument()
  })

  it('opens the add-holding modal from the Add button', async () => {
    render(<PortfolioPage />)
    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(screen.getByRole('dialog', { name: /add holding/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PortfolioPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AppShell**

`src/components/layout/AppShell.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Plus, Settings } from 'lucide-react'

export function AppShell({
  children,
  onAdd,
  onSettings,
}: {
  children: ReactNode
  onAdd: () => void
  onSettings: () => void
}) {
  return (
    <div className="min-h-full bg-app-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <h1 className="text-lg font-semibold tracking-tight text-gold">CryptoFolio</h1>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onAdd} aria-label="Add holding" className="flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-black">
              <Plus size={16} /> Add
            </button>
            <button onClick={onSettings} aria-label="Settings" className="rounded-lg border border-border p-2 text-text-secondary hover:text-text-primary">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Implement PortfolioPage**

`src/routes/PortfolioPage.tsx`:

```tsx
import { useState } from 'react'
import { usePortfolioStore } from '../store/portfolioStore'
import { AppShell } from '../components/layout/AppShell'
import { TotalPortfolioCard } from '../components/portfolio/TotalPortfolioCard'
import { ControlBar } from '../components/portfolio/ControlBar'
import { TokenGroupedGrid } from '../components/portfolio/TokenGroupedGrid'
import { FlatHoldingsGrid } from '../components/portfolio/FlatHoldingsGrid'
import { ExchangeGroupedGrid } from '../components/portfolio/ExchangeGroupedGrid'
import { AddHoldingModal } from '../components/modals/AddHoldingModal'
import { SettingsModal } from '../components/modals/SettingsModal'

export function PortfolioPage() {
  const holdings = usePortfolioStore((s) => s.holdings)
  const groupMode = usePortfolioStore((s) => s.groupMode)
  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <AppShell onAdd={() => setAddOpen(true)} onSettings={() => setSettingsOpen(true)}>
      <div className="flex flex-col gap-5">
        <TotalPortfolioCard />
        <ControlBar />
        {holdings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-text-tertiary">
            No holdings yet — tap Add to track your first coin.
          </div>
        ) : groupMode === 'token' ? (
          <TokenGroupedGrid />
        ) : groupMode === 'exchange' ? (
          <ExchangeGroupedGrid />
        ) : (
          <FlatHoldingsGrid />
        )}
      </div>
      <AddHoldingModal open={addOpen} onClose={() => setAddOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AppShell>
  )
}
```

- [ ] **Step 5: Replace App.tsx with the router**

`src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { PortfolioPage } from './routes/PortfolioPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PortfolioPage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- PortfolioPage`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add src/routes/PortfolioPage.tsx src/components/layout/AppShell.tsx src/App.tsx src/routes/PortfolioPage.test.tsx
git commit -m "feat: PortfolioPage + AppShell + routing"
```

---

### Task 14: Full-suite green + manual verification + docs

**Files:**
- Create: `cryptofolio-web/README.md`

**Interfaces:**
- Consumes: everything. No new exports.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass (types, constants, formatters, themeStore, selectors, portfolioStore, ui, TotalPortfolioCard, ControlBar, TokenCard, TokenGroupedGrid, AddHoldingModal, PortfolioPage).

- [ ] **Step 2: Type-check + production build**

Run: `npm run build`
Expected: `tsc -b` passes with no errors; `dist/` produced.

- [ ] **Step 3: Manual smoke test in the browser**

Run: `npm run dev`, open the printed URL. Verify by hand:
- Add a holding (e.g. Bitcoin, 0.5, Coinbase) → card appears in Token view.
- Add a second exchange for the same coin → Token card shows "2 locations"; tap it → breakdown modal lists both.
- Switch group modes Token / Exchange / All → layout changes; Exchange view shows per-exchange headers.
- Switch sort modes → order changes (with prices absent, Value/Change are stable; Name sorts alphabetically).
- Toggle currency USD/EUR → symbol switches (values are `$0.00`/`€0.00` until Phase 2).
- Open Settings → change Appearance Dark/Light/System → theme flips live; reload → preference persists.
- Reload the page → holdings persist (localStorage).
Expected: all behaviors as described. Note: live prices/values arrive in Phase 2 — everything shows `—`/`0` here, which is correct.

- [ ] **Step 4: Verify local Cloudflare Pages serving**

Run: `npx wrangler pages dev dist` (after `npm run build`)
Expected: Wrangler serves the SPA; the app loads at the printed localhost URL. (Confirms the Pages deploy target works; Functions come in Phase 2.)

- [ ] **Step 5: Write the README**

`cryptofolio-web/README.md`:

```markdown
# CryptoFolio Web

Web port of the CryptoFolio SwiftUI app. Vite + React + TypeScript SPA, deployed to
Cloudflare Pages. See `../docs/superpowers/specs/2026-08-01-cryptofolio-web-migration-design.md`.

## Develop
- `npm install`
- `npm run dev` — Vite dev server
- `npm test` — Vitest
- `npm run build` — type-check + production build to `dist/`
- `npx wrangler pages dev dist` — serve the built app via Cloudflare Pages locally

## Status
- Phase 1 (foundation): holdings CRUD, grouping/sorting, theme, localStorage — DONE
- Phase 2 (live prices via Pages Functions proxy) — planned
- Phase 3 (historical charts) — planned

## Deploy (run yourself against your Cloudflare account)
- `npx wrangler pages deploy dist`
```

- [ ] **Step 6: Commit**

```bash
git add cryptofolio-web/README.md
git commit -m "docs: cryptofolio-web README + Phase 1 complete"
```

---

## Self-Review

**Spec coverage (Phase 1 rows of the parity table):**
- Add/edit/remove holdings → Tasks 6, 12. ✓
- Token/Exchange/All group modes → Tasks 6 (selectors), 11 (grids), 13 (switch). ✓
- Value/Name/24h-change sort → Task 6 `compare`. ✓
- 2-column card grid → Task 11 (`sm:grid-cols-2`, 1-col mobile). ✓
- Token breakdown modal → Task 11. ✓
- Dark/Light/System theme → Task 5. ✓
- Persist holdings locally → Task 6 `persist`. ✓
- 13 exchanges / 20 coins constants → Task 3. ✓
- Theme tokens from Theme.swift → Task 5 CSS. ✓
- Deferred to Phase 2/3 (live prices, images, charts) → intentionally not in this plan; store fields exist and stay empty. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; no "handle edge cases" hand-waving. ✓

**Type consistency:** `PortfolioSnapshot` shape is identical everywhere (built via `useSnapshot` or inline with the same 4 fields). Store action names (`addHolding`, `updateHolding(id,…)`, `removeHolding(id)`, `setGroupMode/SortMode/Currency`) match across store, ControlBar, and modals. Selector names (`priceFor`, `dailyChangeFor`, `totalValue`, `totalChange24h`, `sortedHoldings`, `holdingsByToken`, `holdingsByExchange`) are used consistently. `newHolding`/`exchangeLogoUrl` imported from `types` throughout. ✓

**Note on `updateHolding` signature:** the spec's store section listed `updateHolding(holding, amount, exchangeId)` (mirroring Swift). This plan uses `updateHolding(id, amount, exchangeId)` — an id is sufficient and avoids passing stale holding objects. Deliberate, consistent across all call sites.
