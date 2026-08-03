# CryptoFolio Web

Vite + React + TypeScript SPA. See the [root README](../README.md) for the project
overview.

## Status
- Phase 1 (foundation): holdings CRUD, grouping/sorting, theme, localStorage — DONE
- Phase 2 (live data): CoinGecko prices + images via Pages Functions proxy (Cache API),
  keep-last-known on rate-limit, manual refresh — DONE
- Phase 3 (historical charts) — DONE

## Develop
- `npm install`
- `npm run dev` — full app + `/api` Functions on one origin with live prices; rebuilds on
  save and live-reloads the browser (Vite build --watch + `wrangler pages dev`, port 8788)
- `npm run dev:ui` — Vite only, fast HMR for pure UI work (`/api` calls 404 here)
- `npm test` — Vitest
- `npm run typecheck:functions` — type-check the Pages Functions (Workers types)
- `npm run build` — app type-check + production build to `dist/`
- `npx wrangler pages dev` — serve the built `dist/` + Functions (uses `pages_build_output_dir`)

> Note: Wrangler 4 deprecated the old `pages dev -- <command>` proxy form, so `npm run dev`
> uses a build-watch + `wrangler pages dev` combo instead (same result: one origin, live data).

## Deploy
Deployed to **Cloudflare Pages** (free tier). Quick deploy: `npm run build && npx wrangler
pages deploy dist`. Full guide (Wrangler CLI + Cloudflare dashboard, custom domains,
caching): [`DEPLOY_CLOUDFLARE.md`](DEPLOY_CLOUDFLARE.md).
