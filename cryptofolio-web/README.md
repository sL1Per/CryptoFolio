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
