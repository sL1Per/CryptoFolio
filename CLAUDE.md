# CryptoFolio — Claude Code Project Brief

## What this is

CryptoFolio is a native macOS/iOS crypto portfolio tracker built in SwiftUI. It tracks
holdings across multiple exchanges, fetches live prices from CoinGecko's free API, and
shows a historical portfolio value chart. There is no backend — all data lives on-device
in UserDefaults. The app has a dark terminal aesthetic with gold (#ffc850) accents and
monospaced fonts.

The project is **actively being developed** and has a planned web app port (React/Next.js).
When working on this codebase, always check ARCHITECTURE.md first to understand data flow
before touching PortfolioViewModel or Models.

---

## Build & run

```bash
# Open in Xcode (macOS 13+ required for Swift Charts)
open CryptoFolio.xcodeproj

# Build from CLI (no signing required for local dev)
xcodebuild \
  -scheme CryptoFolio \
  -configuration Debug \
  -destination "platform=macOS" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_REQUIRED=NO \
  build

# Build release DMG (see DISTRIBUTION.md)
xcodebuild \
  -scheme CryptoFolio \
  -configuration Release \
  -destination "platform=macOS" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  CONFIGURATION_BUILD_DIR=~/Desktop/CryptoFolio-build \
  build
```

**Minimum deployment target:** macOS 13.0 (Swift Charts requirement)
**Swift version:** Swift 5.9+
**No external Swift packages** — zero dependencies beyond Apple frameworks

---

## Project structure

```
CryptoFolio/
├── CryptoFolioApp.swift      # App entry point, window scenes, ThemeWrapper
├── Models.swift              # All data models and enums
├── PortfolioViewModel.swift  # Single source of truth — all state and API calls
├── Theme.swift               # Adaptive color system (dark/light)
├── ContentView.swift         # Main window: portfolio card, holdings grid, control bar
├── PortfolioChartView.swift  # Separate chart window (Swift Charts)
├── HoldingRow.swift          # (Legacy) single-col row — still used in some contexts
├── CoinImageView.swift       # CoinImageView + ExchangeBadge components
├── AddHoldingView.swift      # Add/edit holding sheet
├── SettingsView.swift        # Currency, appearance, about settings
├── AppIcon.svg               # Master app icon (1024×1024)
└── AppIcon-Preview.html      # Icon preview at all Xcode sizes
```

---

## Key conventions

### State management
- One `PortfolioViewModel` instance lives at the app root, shared via `@EnvironmentObject`
- All state mutations go through the VM — never mutate `holdings` directly from a View
- `@MainActor` on ViewModel ensures UI updates stay on the main thread
- Persistence is `UserDefaults` only (no CoreData, no SQLite)

### Theme system
- **Never use hardcoded hex colors in views** — always use `@Environment(\.theme)` tokens
- The `Theme` struct returns different `Color` values based on `ColorScheme`
- Gold (`#ffc850`) is the only constant — it works in both modes
- See `Theme.swift` for the full token list

### API — CoinGecko free tier
- No API key required
- Rate limit: ~30 req/min — be very conservative, the free tier is strict
- Prices: `GET /simple/price?ids={ids}&vs_currencies=usd,eur&include_24hr_change=true`
- Images: `GET /coins/markets?vs_currency=usd&ids={ids}&per_page=250`
- History: `GET /coins/{id}/market_chart?vs_currency={cur}&days={days}`
- Always check for HTTP 429 and back off — see `fetchHistoricalData` for the pattern
- Chart data is cached in UserDefaults with TTLs: 10min (7D), 1h (1M), 6h (1Y), 24h (5Y)

### Chart caching rules (critical)
- **Never blank the chart when rate-limited** — always show stale cache if available
- Cache key format: `"coinId|currency|range"`
- Show cached data immediately, then refresh stale entries silently in background
- On 429: wait 15s, retry once, then give up gracefully without clearing the UI

### Naming
- Views are structs with descriptive names: `TotalPortfolioCard`, `HoldingCard`, `TokenCard`
- Private helpers at file bottom, prefixed with `private`
- `MARK:` comments separate every logical section
- Enums are the source of truth for options: `GroupMode`, `SortMode`, `Currency`, `TimeRange`

---

## Current features

- Live prices in USD and EUR (CoinGecko free API)
- Add / edit / remove holdings with token amount and exchange assignment
- 13 supported exchanges with real favicons (Google favicon CDN)
- 20 popular coins with CoinGecko images; letter fallback for unknown coins
- Three group modes: Token (default) · Exchange · All
- Three sort modes: Value · Name · 24h Change
- Token view: 2-column card grid, tap card → exchange breakdown sheet
- Exchange view: per-exchange headers with 2-column card grid
- Historical chart in separate window: 7D / 1M / 1Y / 5Y
- Chart caching with UserDefaults persistence and TTL-based staleness
- Dark / Light / System appearance modes
- Adaptive theme system (no hardcoded colors in views)
- Credits: "Made with ♥ by Pedro Viegas and Claude.ai — 2026"

---

## Known limitations / tech debt

- CoinGecko free API is rate-limited; users with many coins may see partial chart data
- No search for coins outside the hardcoded `Coin.popular` list of 20
- UserDefaults is not suitable for large portfolios (>100 holdings)
- No unit tests
- No iCloud sync
- `HoldingRow.swift` is partially superseded by `HoldingCard` in ContentView but kept for
  potential list-view toggle in the future

---

## Planned web port

See `WEB_MIGRATION.md` for the full plan. The short version:
- **Framework:** Next.js 14 (App Router) + React
- **Styling:** Tailwind CSS (same design tokens as Theme.swift)
- **State:** Zustand (mirrors PortfolioViewModel structure)
- **Charts:** Recharts or Tremor
- **Storage:** localStorage → later Supabase for multi-device sync
- **API:** same CoinGecko free endpoints, proxied through a Next.js API route to hide rate
  limiting and add server-side caching
