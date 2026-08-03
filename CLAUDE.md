# CryptoFolio — Claude Code Project Brief

## What this is

CryptoFolio is a privacy-first crypto portfolio tracker: a **Vite + React + TypeScript**
single-page app with a dark, terminal-inspired aesthetic (gold `#ffc850` accent,
monospaced fonts). It tracks holdings across multiple exchanges, fetches live prices from
CoinGecko's free API through a small serverless proxy, and shows a historical portfolio
value chart. There is **no backend database** — all portfolio data lives on-device in
`localStorage`.

The app is the active, published project and lives in **`cryptofolio-web/`**. A prior
native macOS/SwiftUI version and internal design docs are kept locally but are **not part
of this repository** (see `.gitignore`).

---

## Where things live

```
cryptofolio-web/
├── src/
│   ├── components/       # UI: layout, portfolio, chart, modals, ui primitives
│   ├── store/            # Zustand stores (portfolioStore, themeStore) + selectors
│   ├── lib/              # coingecko client, cache, formatters, exportPortfolio, constants
│   ├── routes/           # PortfolioPage
│   └── types/            # shared models and enums
├── functions/api/        # Cloudflare Pages Functions — the CoinGecko proxy
│   ├── prices.ts · images.ts · history/[id].ts
│   └── _lib/cacheProxy.ts   # shared, dependency-injected edge-cache proxy
├── infra/                # AWS deployment target
│   ├── lambda/handler.mjs   # the same proxy, ported to AWS Lambda (Function URL)
│   └── template.yaml        # AWS SAM template (S3 + CloudFront + Lambda)
├── DEPLOY_AWS.md         # AWS free-tier deployment guide
└── README.md             # web-app dev notes
```

---

## Build, run, test

```bash
cd cryptofolio-web
npm install

npm run dev        # full app + /api proxy on one origin (live prices), wrangler, port 8788
npm run dev:ui     # Vite only — fast HMR for pure UI work (/api calls 404 here)
npm test           # Vitest suite
npm run build      # tsc -b + functions type-check + vite build → dist/
node --test infra/lambda   # unit tests for the AWS Lambda proxy port
```

---

## Key conventions

### State management
- Two Zustand stores: `portfolioStore` (holdings, currency, grouping/sorting, prices, chart
  data + cache) and `themeStore` (appearance). Both use the `persist` middleware.
- All state mutations go through store actions — never mutate store state directly in a
  component.
- Persisted `localStorage` keys: `cryptofolio_holdings_v2`, `cryptofolio_appearance`,
  `cryptofolio_chartcache_v1`.

### Theme system
- **No hardcoded hex colors in components** — use the Tailwind design tokens
  (`text-primary`, `sheet-bg`, `border`, …) defined in `tailwind.config.ts` / `globals.css`.
- Gold (`#ffc850`) is the one constant accent; it works in both light and dark.

### CoinGecko proxy (critical)
- The frontend never calls CoinGecko directly — it calls same-origin `/api/prices`,
  `/api/images`, `/api/history/{id}`.
- No API key. Free tier is ~30 req/min — be conservative.
- The proxy **caches** per-endpoint (prices 60s, history 10min–24h, images 24h) and
  **keeps last-known** data, serving stale on HTTP 429 rather than blanking the UI.
- Cache-proxy logic is dependency-injected (`cacheProxy` in `functions/api/_lib/`) so it is
  shared/testable; the AWS port (`infra/lambda/handler.mjs`) mirrors the same behavior.

### Naming & style
- Components are descriptively named function components (`TotalPortfolioCard`, `TokenCard`,
  `PortfolioChart`). Co-locate a `*.test.tsx` next to the component.
- Enums/const maps are the source of truth for options: group modes, sort modes, currency,
  time ranges.

---

## Testing
- **Test-driven**: write the failing test first, then the implementation.
- Vitest + Testing Library for the app (`src/**/*.test.ts[x]`); the CoinGecko proxy and its
  AWS port have their own tests (`functions/api/**`, `infra/lambda/handler.test.mjs`).

---

## Deployment
- **Cloudflare Pages** (current): `npx wrangler pages deploy dist`.
- **AWS free tier**: see `cryptofolio-web/DEPLOY_AWS.md` (S3 + CloudFront + Lambda; console
  walkthrough and a SAM template).
