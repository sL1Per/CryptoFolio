# CryptoFolio Web

Web port of the CryptoFolio SwiftUI app. Vite + React + TypeScript SPA, deployed to
Cloudflare Pages. See `../docs/superpowers/specs/2026-08-01-cryptofolio-web-migration-design.md`.

## Status
- Phase 1 (foundation): holdings CRUD, grouping/sorting, theme, localStorage — DONE
- Phase 2 (live data): CoinGecko prices + images via Pages Functions proxy (Cache API),
  keep-last-known on rate-limit, manual refresh — DONE
- Phase 3 (historical charts) — planned

## Develop
- `npm install`
- `npm run dev` — Wrangler serves the SPA + /api Functions on one origin (prod parity)
- `npm run dev:vite` — Vite only (UI work; /api calls 404)
- `npm test` — Vitest
- `npm run typecheck:functions` — type-check the Pages Functions (Workers types)
- `npm run build` — app type-check + production build to `dist/`
- `npx wrangler pages dev dist` — serve the built app + Functions locally

## Deploy (run yourself against your Cloudflare account)
- `npx wrangler pages deploy dist`
