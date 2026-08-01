# CryptoFolio — Web Migration Plan

This document describes how to port CryptoFolio from SwiftUI to a Next.js web app,
keeping the same design language, feature set, and data model.

---

## Target stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Framework | Next.js 14 (App Router) | SSR for SEO, API routes for CoinGecko proxy |
| Language | TypeScript | Type safety mirrors Swift's type system |
| Styling | Tailwind CSS + CSS variables | Maps 1:1 to Theme.swift tokens |
| State | Zustand | Mirrors PortfolioViewModel — single store, minimal boilerplate |
| Charts | Recharts | Best API for portfolio-style area/line charts in React |
| Icons | Lucide React | Clean, consistent icon set |
| Storage (v1) | localStorage | Drop-in replacement for UserDefaults |
| Storage (v2) | Supabase | Multi-device sync, later addition |

---

## Repository structure

```
cryptofolio-web/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout, ThemeProvider, fonts
│   ├── page.tsx                  # Main portfolio view (/)
│   ├── chart/page.tsx            # Fullscreen chart view (/chart)
│   └── api/
│       ├── prices/route.ts       # Proxy: CoinGecko /simple/price
│       ├── images/route.ts       # Proxy: CoinGecko /coins/markets
│       └── history/[id]/route.ts # Proxy: CoinGecko /market_chart with server cache
├── components/
│   ├── layout/
│   │   └── AppShell.tsx
│   ├── portfolio/
│   │   ├── TotalPortfolioCard.tsx
│   │   ├── ControlBar.tsx
│   │   ├── HoldingCard.tsx
│   │   ├── TokenCard.tsx
│   │   ├── TokenBreakdownModal.tsx
│   │   ├── FlatHoldingsGrid.tsx
│   │   ├── TokenGroupedGrid.tsx
│   │   └── ExchangeGroupedGrid.tsx
│   ├── chart/
│   │   ├── PortfolioChart.tsx
│   │   ├── StatsBar.tsx
│   │   └── TimeRangePicker.tsx
│   ├── modals/
│   │   ├── AddHoldingModal.tsx
│   │   └── SettingsModal.tsx
│   └── ui/
│       ├── CoinImage.tsx
│       ├── ExchangeBadge.tsx
│       ├── ChangeBadge.tsx
│       └── SectionHeader.tsx
├── store/
│   ├── portfolioStore.ts         # Zustand — mirrors PortfolioViewModel
│   └── themeStore.ts             # Appearance preference
├── lib/
│   ├── coingecko.ts              # API client functions
│   ├── cache.ts                  # localStorage chart cache (mirrors ChartCacheEntry)
│   ├── formatters.ts             # format(), asPercentChange, formatAmount
│   └── constants.ts              # POPULAR_COINS, EXCHANGES (from Models.swift)
├── styles/
│   └── globals.css               # CSS variables from Theme.swift
├── types/
│   └── index.ts                  # TypeScript types (mirrors Models.swift)
└── public/
    └── icon.svg                  # AppIcon.svg
```

---

## Type definitions (from Models.swift)

```typescript
// types/index.ts

export interface Coin {
  id: string
  symbol: string
  name: string
}

export interface Exchange {
  id: string
  name: string
  color: string        // hex without #
  domain: string
  logoUrl: string      // computed: google favicon CDN
}

export interface Holding {
  id: string           // crypto.randomUUID()
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
```

---

## Zustand store (mirrors PortfolioViewModel)

```typescript
// store/portfolioStore.ts

interface PortfolioState {
  // Holdings
  holdings: Holding[]
  groupMode: GroupMode
  sortMode: SortMode

  // Prices
  prices: Record<string, CoinPrice>
  coinImages: Record<string, string>
  currency: Currency
  isLoading: boolean
  lastUpdated: Date | null
  errorMessage: string | null

  // Chart
  selectedTimeRange: TimeRange
  historicalData: PortfolioDataPoint[]
  isLoadingChart: boolean
  chartError: string | null
  chartLoadingStatus: string
  chartCachedAt: Date | null
  chartIsStale: boolean

  // Actions (same names as ViewModel methods)
  addHolding: (coin: Coin, amount: number, exchangeId: string) => void
  updateHolding: (holding: Holding, amount: number, exchangeId: string) => void
  removeHolding: (id: string) => void
  setCurrency: (currency: Currency) => void
  fetchPrices: () => Promise<void>
  fetchHistoricalData: (forceRefresh?: boolean) => Promise<void>

  // Computed (selectors, not stored)
  // Use: usePortfolioStore(state => totalValue(state))
}
```

---

## CSS variables (from Theme.swift)

```css
/* styles/globals.css */

:root {
  /* Light mode */
  --app-bg: #f0f2f5;
  --sheet-bg: #f7f8fa;
  --card-bg: rgba(255,255,255,0.85);
  --card-bg-hover: #e8eaed;
  --row-bg: #ffffff;
  --border: rgba(0,0,0,0.07);
  --border-hover: rgba(255,200,80,0.5);
  --subtle-border: rgba(0,0,0,0.05);
  --text-primary: #111111;
  --text-secondary: #555555;
  --text-tertiary: #999999;
  --text-faint: #cccccc;
  --field-bg: #ffffff;
  --field-border: rgba(0,0,0,0.12);
}

.dark {
  --app-bg: #080b10;
  --sheet-bg: #0a0d12;
  --card-bg: rgba(255,255,255,0.03);
  --card-bg-hover: rgba(255,255,255,0.06);
  --row-bg: rgba(255,255,255,0.03);
  --border: rgba(255,255,255,0.06);
  --border-hover: rgba(255,200,80,0.15);
  --subtle-border: rgba(255,255,255,0.04);
  --text-primary: #e0e0e0;
  --text-secondary: #888888;
  --text-tertiary: #555555;
  --text-faint: #333333;
  --field-bg: rgba(255,255,255,0.05);
  --field-border: rgba(255,255,255,0.1);
}

/* Constants (same in both modes) */
:root {
  --gold: #ffc850;
  --gold-dim: rgba(255,200,80,0.08);
  --gold-border: rgba(255,200,80,0.15);
  --gold-card-bg: rgba(255,200,80,0.05);
  --green: #00d97e;
  --red: #ff4d6d;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
}
```

---

## CoinGecko API proxy (server-side caching)

The key upgrade over the native app: the web version can cache CoinGecko responses on
the **server** so the rate limit is shared across all users, not per-user.

```typescript
// app/api/prices/route.ts
import { NextResponse } from 'next/server'

// In-memory cache (upgrade to Redis for production)
const cache = new Map<string, { data: unknown; expiresAt: number }>()

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ids = searchParams.get('ids')
  const cacheKey = `prices:${ids}`
  const cached = cache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,eur&include_24hr_change=true`,
    { next: { revalidate: 60 } }   // Next.js fetch cache — 60s
  )

  if (res.status === 429) {
    // Return stale cache rather than erroring
    if (cached) return NextResponse.json(cached.data)
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const data = await res.json()
  cache.set(cacheKey, { data, expiresAt: Date.now() + 60_000 })
  return NextResponse.json(data)
}
```

Same pattern for `/api/history/[id]/route.ts` with TTLs matching the native app.

---

## Component mapping

| SwiftUI Component | React Component | Notes |
|------------------|-----------------|-------|
| `TotalPortfolioCard` | `TotalPortfolioCard.tsx` | Same layout, CSS vars for colors |
| `ControlBar` | `ControlBar.tsx` | Segmented control → styled button group |
| `HoldingCard` | `HoldingCard.tsx` | Same 2-col grid card design |
| `TokenCard` | `TokenCard.tsx` | onClick → open modal |
| `TokenBreakdownSheet` | `TokenBreakdownModal.tsx` | Sheet → `<dialog>` or Radix Dialog |
| `CoinImageView` | `CoinImage.tsx` | `<img>` with onError fallback to letter |
| `ExchangeBadge` | `ExchangeBadge.tsx` | Same favicon CDN approach |
| `AddHoldingView` | `AddHoldingModal.tsx` | Form with coin search + exchange picker |
| `SettingsView` | `SettingsModal.tsx` | Same sections |
| `ChartWindowView` | `chart/page.tsx` | Separate route instead of separate window |
| `PortfolioChartView` (chart) | `PortfolioChart.tsx` | Recharts AreaChart + LineChart |

---

## Migration phases

### Phase 1 — Foundation (no API yet)
- [ ] Next.js project with TypeScript, Tailwind, CSS variables
- [ ] Copy types from Models.swift → `types/index.ts`
- [ ] Copy constants (POPULAR_COINS, EXCHANGES) → `lib/constants.ts`
- [ ] Zustand store with localStorage persistence (no API calls yet)
- [ ] Static UI: TotalPortfolioCard, ControlBar, HoldingCard skeleton
- [ ] Add/Edit/Remove holdings modal
- [ ] Dark/light theme toggle

### Phase 2 — Live data
- [ ] Next.js API routes as CoinGecko proxy with server-side cache
- [ ] `fetchPrices()` in Zustand store hitting `/api/prices`
- [ ] Coin images via `/api/images`
- [ ] Exchange favicons (same Google CDN approach)
- [ ] Error states and loading skeletons

### Phase 3 — Charts
- [ ] `/api/history/[id]` route with TTL caching
- [ ] `PortfolioChart.tsx` with Recharts
- [ ] Time range picker (7D / 1M / 1Y / 5Y)
- [ ] Stats bar (start / current / peak / low / abs. change)
- [ ] localStorage chart cache mirroring native app behavior
- [ ] Stale-data banner

### Phase 4 — Polish
- [ ] Responsive layout (mobile-first, 1-col on narrow screens → 2-col on desktop)
- [ ] Animations (Framer Motion for card hover, modal transitions)
- [ ] PWA manifest + service worker for offline cache
- [ ] App icon (use AppIcon.svg directly)

### Phase 5 — Backend (optional)
- [ ] Supabase for multi-device sync
- [ ] Auth (email magic link or OAuth)
- [ ] Portfolio shared via public link

---

## Feature parity checklist

| Feature | Native | Web |
|---------|--------|-----|
| Live prices (USD + EUR) | ✅ | Phase 2 |
| Add / edit / remove holdings | ✅ | Phase 1 |
| 13 exchanges with logos | ✅ | Phase 2 |
| 20 popular coins with images | ✅ | Phase 2 |
| Token / Exchange / All group modes | ✅ | Phase 1 |
| Value / Name / 24h Change sort | ✅ | Phase 1 |
| 2-column card grid | ✅ | Phase 1 |
| Token breakdown sheet/modal | ✅ | Phase 1 |
| Historical chart 7D/1M/1Y/5Y | ✅ | Phase 3 |
| Chart caching with staleness | ✅ | Phase 3 |
| Dark / Light / System theme | ✅ | Phase 1 |
| Persist holdings locally | ✅ | Phase 1 |
| Multi-device sync | ❌ | Phase 5 |
