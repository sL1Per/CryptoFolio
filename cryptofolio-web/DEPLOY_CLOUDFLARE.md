# Deploying CryptoFolio to Cloudflare Pages (free tier)

CryptoFolio deploys to **Cloudflare Pages**: the static Vite/React SPA is served from
Pages, and the three `/api/*` endpoints run as **Pages Functions** on the Workers runtime —
same origin as the site, so the frontend's relative `/api/...` calls work with no CORS and
no code changes.

There are two ways to deploy. Do **one**:

- **[Method A — Cloudflare dashboard (Git integration)](#method-a--cloudflare-dashboard-git-integration)** —
  connect the GitHub repo once; every push to `main` builds and deploys automatically. No
  terminal. Recommended.
- **[Method B — Wrangler CLI (direct upload)](#method-b--wrangler-cli-direct-upload)** —
  build locally and push the `dist/` folder yourself.

---

## Architecture

```
                     ┌──────────── Cloudflare Pages (one origin) ────────────┐
   browser  ───────▶ │  /*         → static assets (dist/, the SPA)          │
                     │  /api/*     → Pages Functions (functions/api/)        │
                     └───────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
                                   Workers runtime — proxy handler
                                   /api/prices · /api/images · /api/history/{id}
                                                     │
                                                     ▼
                                       api.coingecko.com  (free tier)
```

The proxy (`functions/api/`) caches upstream responses in the **Workers Cache API**
(`caches.default`) for a per-endpoint TTL and **keeps the last known value** on a CoinGecko
`429`, so the UI never blanks out when rate-limited.

---

## Free tier

| Resource | Free allowance |
|---|---|
| **Pages static requests & bandwidth** | Unlimited |
| **Pages builds** | 500 / month, 1 concurrent build |
| **Pages Functions (Workers requests)** | 100,000 requests / day |
| **Custom domains & SSL** | Included |

A personal portfolio app stays comfortably inside this — the Cache API and CoinGecko TTLs
keep Function invocations low. (Cloudflare's limits change over time; check your dashboard
for current numbers.)

---

## Prerequisites

1. A **Cloudflare account** (free).
2. **Node 20+** and the repo checked out.
3. For Method B: **Wrangler** (bundled — used via `npx wrangler`).

Build the app once (both methods produce `dist/`):

```bash
cd cryptofolio-web
npm install
npm run build      # → dist/
```

---

## Method A — Cloudflare dashboard (Git integration)

This connects your GitHub repo so Cloudflare builds and deploys on every push. Because this
is a monorepo (the app lives in `cryptofolio-web/`), the **root directory** setting matters.

1. **Dashboard → Workers & Pages → Create → Pages → Connect to Git.**
2. Authorize Cloudflare for GitHub and pick the **`CryptoFolio`** repository.
3. **Set up builds and deployments:**
   | Field | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `None` (or `Vite`) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | **Root directory** (Advanced) | `cryptofolio-web` |
   Cloudflare auto-detects the `functions/` directory (relative to the root directory), so
   the `/api/*` routes deploy automatically — no extra config.
4. Click **Save and Deploy.** The first build runs; when it finishes you get a
   `https://<project>.pages.dev` URL.
5. **Verify:**
   - The portfolio loads, prices populate, the history chart works.
   - `https://<project>.pages.dev/api/prices?ids=bitcoin` returns JSON.

From now on, every push to `main` auto-deploys; pull requests get preview deployments at
their own URLs.

---

## Method B — Wrangler CLI (direct upload)

1. **Log in** (opens a browser to authorize — one time):
   ```bash
   npx wrangler login
   ```
2. **Build and deploy** the `dist/` folder:
   ```bash
   cd cryptofolio-web
   npm run build
   npx wrangler pages deploy dist
   ```
   The first deploy offers to **create the Pages project** (name it `cryptofolio-web`, to
   match `wrangler.toml`). Wrangler uploads `dist/` **and** the `functions/` directory, then
   prints the deployment URL.
3. **Verify** the same way as [Method A step 5](#method-a--cloudflare-dashboard-git-integration).

Redeploy anytime by re-running the build + `wrangler pages deploy dist`.

> `wrangler.toml` already sets `pages_build_output_dir = "dist"` and the project `name`, so
> Wrangler and the dashboard agree on where the build output lives.

---

## Local development & preview

```bash
cd cryptofolio-web
npm run dev       # full app + /api Functions on one origin (live data), port 8788
npm run dev:ui    # Vite only — fast HMR for pure UI work (/api calls 404 here)
npx wrangler pages dev   # serve the built dist/ + Functions, mirroring production
```

---

## Custom domain

1. In the Pages project → **Custom domains → Set up a custom domain.**
2. Enter your domain (or subdomain). If the domain is on Cloudflare, DNS and SSL are
   configured automatically; otherwise add the shown CNAME at your DNS provider.

---

## Caching notes

Caching lives entirely in the Pages Functions (`functions/api/_lib/cacheProxy.ts`):

- Fresh-TTL per endpoint: prices `60s`, history `10min–24h` (by range), images `24h`.
- On a fresh hit the cached value is returned without calling CoinGecko.
- On a CoinGecko `429`, the last cached value is served (`x-cache-status: stale`) instead of
  an error — inspect the `x-cache-status` response header (`fresh` / `stale` / `miss`) to
  see what happened.

No configuration is required; the Workers Cache API is available to Pages Functions by
default.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build succeeds but the site is blank / 404 | Check **Build output directory = `dist`** and **Root directory = `cryptofolio-web`** (Method A). |
| `/api/*` returns 404 | Functions weren't detected — ensure the root directory is `cryptofolio-web` so `functions/` sits directly under it. |
| Prices empty, `/api/prices` returns `429` | CoinGecko free-tier rate limit (~30 req/min). Cache + keep-last-known cover normal use; wait a minute if you just added many coins. |
| Build fails on `wrangler` version | This project targets Wrangler 4; `npx wrangler` uses the pinned dev dependency. |
| Refreshing a route 404s | The SPA uses client routing; Pages serves `index.html` for unmatched paths by default, so this normally just works. |

---

## Teardown

Delete the Pages project from **Workers & Pages → your project → Settings → Delete
project**. That removes all deployments; there is nothing else to clean up.
