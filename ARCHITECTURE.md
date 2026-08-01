# CryptoFolio — Architecture

## Overview

CryptoFolio is a **single-ViewModel, multi-window SwiftUI app**. There is no router, no
dependency injection container, and no local database. The entire app state lives in one
`@ObservableObject` class that is created once at the app root and shared everywhere via
`@EnvironmentObject`.

```
┌─────────────────────────────────────────────────┐
│                  CryptoFolioApp                 │
│  @StateObject PortfolioViewModel (single inst.) │
│  @AppStorage  appearance (dark/light/system)    │
│                                                 │
│   ┌─────────────────┐  ┌──────────────────────┐ │
│   │  Main Window    │  │   Chart Window       │ │
│   │  ContentView    │  │   ChartWindowView    │ │
│   │  (480×780)      │  │   (680×480)          │ │
│   └─────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────┘
```

Both windows share the same `PortfolioViewModel` instance. Changes in one window (e.g.
adding a holding) are immediately reflected in the other.

---

## Data layer

### Models (`Models.swift`)

```
Coin          { id, symbol, name }
              └── static list of 20 popular coins

Exchange      { id, name, color, domain }
              └── static list of 13 exchanges
              └── logoURL computed from Google favicon CDN

Holding       { id: UUID, coin: Coin, amount: Double, exchangeId: String }
              └── persisted to UserDefaults as JSON array

AggregatedHolding  { coin, totalAmount, breakdown: [(Exchange, Double)] }
                   └── computed on demand in ViewModel (not persisted)

CoinPrice     { usd?, eur?, usdDailyChange?, eurDailyChange? }
              └── decoded from CoinGecko /simple/price response

PortfolioDataPoint { id: UUID, date: Date, value: Double }
                   └── computed from chart history × holding amounts
```

### Enums (all in `Models.swift`)

| Enum | Cases | Purpose |
|------|-------|---------|
| `Currency` | usd, eur | Active display currency |
| `TimeRange` | week, month, year, fiveYears | Chart time window |
| `GroupMode` | token, exchange, all | Holdings grouping |
| `SortMode` | value, name, change | Holdings sort order |
| `AppearanceMode` | system, dark, light | In `PortfolioViewModel.swift` |

---

## ViewModel (`PortfolioViewModel.swift`)

All business logic lives here. `@MainActor` ensures every `@Published` mutation runs on
the main thread, avoiding explicit `DispatchQueue.main.async` calls.

### Published state

```swift
// Holdings
@Published var holdings: [Holding]
@Published var groupMode: GroupMode        // .token (default)
@Published var sortMode:  SortMode         // .value (default)

// Prices
@Published var prices:      [String: CoinPrice]   // coinId → price
@Published var coinImages:  [String: String]       // coinId → image URL
@Published var currency:    Currency
@Published var isLoading:   Bool
@Published var lastUpdated: Date?
@Published var errorMessage: String?

// Chart
@Published var selectedTimeRange: TimeRange
@Published var historicalData:    [PortfolioDataPoint]
@Published var isLoadingChart:    Bool
@Published var chartError:        String?
@Published var chartLoadingStatus: String
@Published var chartCachedAt:     Date?
@Published var chartIsStale:      Bool
```

### Computed properties (derived from holdings + prices)

```swift
var totalValue: Double         // sum of (price × amount) for all holdings
var totalChange24h: Double     // sum of (price × amount × change%) for all holdings
var sortedHoldings: [Holding]  // flat list sorted by sortMode
var holdingsByExchange: [...]  // grouped by exchangeId, sorted by totalValue
var holdingsByToken: [AggregatedHolding]  // aggregated across exchanges, sorted
```

### API calls

```
fetchPrices()
  └── GET /simple/price?ids={all_coin_ids}&vs_currencies=usd,eur&include_24hr_change=true
  └── GET /coins/markets?...  (coin images, only for coins not yet cached)

fetchHistoricalData(forceRefresh: Bool)
  └── For each stale coin:
      └── GET /coins/{id}/market_chart?vs_currency={cur}&days={days}
      └── 1.5s delay between requests
      └── On 429: wait 15s, retry once
  └── Always shows cached data first
  └── Updates chart incrementally as each coin loads
```

### Persistence (UserDefaults keys)

| Key | Type | Contents |
|-----|------|----------|
| `cryptofolio_holdings_v2` | Data (JSON) | `[Holding]` array |
| `cryptofolio_currency` | String | `"usd"` or `"eur"` |
| `cryptofolio_chartcache_v1` | Data (JSON) | `[ChartCacheEntry]` array |
| `appearance` | String | `"dark"`, `"light"`, or `"system"` (AppStorage) |

### Chart cache

Cache key format: `"coinId|currency|range"` (e.g. `"bitcoin|usd|7D"`)

TTLs:
- 7D  → 10 minutes
- 1M  → 1 hour
- 1Y  → 6 hours
- 5Y  → 24 hours

Cache is always shown first. Stale entries are refreshed in the background. Rate-limit
errors never clear existing chart data.

---

## Theme system (`Theme.swift`)

A custom `EnvironmentKey` that injects a `Theme` struct into the SwiftUI environment.
The `Theme` returns different `Color` values based on the active `ColorScheme`.

```
CryptoFolioApp
└── ThemeWrapper
    ├── .preferredColorScheme(preferredScheme)  ← sets system chrome
    └── .environment(\.theme, Theme(scheme: resolvedScheme))  ← injects tokens

Views:
└── @Environment(\.theme) private var t
    └── t.appBg, t.textPrimary, t.border, t.gold, etc.
```

Token categories:
- **Backgrounds:** `appBg`, `sheetBg`, `cardBg`, `cardBgHover`, `rowBg`, `dropdownBg`, `insetBg`
- **Borders:** `border`, `borderHover`, `subtleBorder`, `fieldBorder`
- **Text:** `textPrimary`, `textSecondary`, `textTertiary`, `textFaint`
- **Fields:** `fieldBg`, `lockedFieldBg`
- **Gold (constant):** `gold`, `goldDim`, `goldBorder`, `goldCardBg`, `goldCardBorder`
- **Status:** `green` (#00d97e), `red` (#ff4d6d)

---

## View hierarchy

```
CryptoFolioApp
├── ThemeWrapper
│   └── ContentView                          ← main window
│       ├── TotalPortfolioCard               ← total value, 24h change, chart button
│       ├── ErrorBanner (conditional)
│       ├── ControlBar                       ← group mode toggle + sort menu
│       └── [GroupMode switch]
│           ├── FlatHoldingsView             ← 2-col LazyVGrid of HoldingCard
│           │   └── HoldingCard ×N
│           ├── ExchangeGroupedView          ← exchange header + 2-col grid per exchange
│           │   └── HoldingCard ×N
│           └── TokenGroupedView             ← 2-col LazyVGrid of TokenCard
│               ├── TokenCard ×N
│               └── [sheet] TokenBreakdownSheet
│
└── ThemeWrapper
    └── ChartWindowView                      ← separate macOS window
        ├── headerBar (total + period change + refresh)
        ├── staleBanner (conditional overlay)
        ├── Chart (Swift Charts AreaMark + LineMark)
        ├── statsBar (start/current/peak/low/abs.change)
        └── timeRangeBar (7D / 1M / 1Y / 5Y)
```

### Sheets (modal presentations)
- `AddHoldingView` — add new holding (coin search → exchange picker → amount)
- `AddHoldingView` with `existingHolding` — edit mode (locked coin/exchange, diff display)
- `SettingsView` — currency, appearance, about
- `TokenBreakdownSheet` — per-exchange breakdown for an aggregated token

---

## External dependencies

| Service | Usage | Auth |
|---------|-------|------|
| CoinGecko free API | Live prices, coin images, historical chart data | None |
| Google Favicon CDN | Exchange logos via `google.com/s2/favicons?domain=...&sz=64` | None |

No Swift packages. No CocoaPods. No SPM dependencies.

---

## Design system

**Colors**
- Background: `#080b10` (dark) / `#f0f2f5` (light)
- Accent: `#ffc850` (gold) — used for all interactive elements
- Success: `#00d97e` (green) — positive price change
- Danger: `#ff4d6d` (red) — negative price change

**Typography**
- All labels: `SF Mono` (`.monospaced` design) for terminal feel
- Body text: System font (`.semibold`, `.medium`, `.regular`)

**Layout**
- Main window: 480×780 default, scrollable
- Chart window: 680×480 default
- Holdings grid: `LazyVGrid` with 2 × `.flexible()` columns, 12pt spacing
- Cards: 14pt corner radius, min height 130pt

---

## Multi-window pattern

SwiftUI's `WindowGroup(id:for:)` API is used for the chart window. The ViewModel is
passed down via `@EnvironmentObject`, so both windows share identical state without any
notification or callback plumbing.

```swift
// Open chart window from ContentView
@Environment(\.openWindow) private var openWindow
openWindow(id: "chart", value: "main")

// Declared in CryptoFolioApp
WindowGroup(id: "chart", for: String.self) { _ in
    ChartWindowView().environmentObject(vm)
}
```

---

## Web migration mapping

See `WEB_MIGRATION.md` for the full plan. Quick reference:

| SwiftUI concept | Web equivalent |
|----------------|----------------|
| `PortfolioViewModel` (@ObservableObject) | Zustand store |
| `@EnvironmentObject` | React Context / Zustand |
| `@AppStorage` | localStorage |
| `UserDefaults` | localStorage / IndexedDB |
| `Theme` + EnvironmentKey | CSS variables + Tailwind config |
| `LazyVGrid` 2-col | CSS Grid `grid-cols-2` |
| `Swift Charts` | Recharts |
| `sheet(item:)` | Modal / Dialog component |
| `WindowGroup` (chart) | Separate route or drawer |
| `AsyncImage` | `<img>` with `loading="lazy"` |
