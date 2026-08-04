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
   > ⚠️ **Choose the _Pages_ tab, not _Workers_.** CryptoFolio is a static SPA plus
   > Pages Functions, so it must be a **Pages** project. If you create it as a Worker,
   > deployments fail in confusing ways — the Worker build runner has no Pages deploy
   > step, its managed credentials aren't scoped for Pages (`Authentication error [code:
   > 10000]`), and bolting on a `npx wrangler pages deploy dist` deploy command doesn't
   > fix it. If you already made a Worker by mistake, delete it and recreate as Pages.
2. Authorize Cloudflare for GitHub and pick the **`CryptoFolio`** repository.
3. **Set up builds and deployments:**
   | Field | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `None` (or `Vite`) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | **Root directory** (Advanced) | `cryptofolio-web` |
   > ⚠️ **The Root directory is essential** — this is a monorepo, so `package.json` lives in
   > `cryptofolio-web/`, not the repo root. If you leave it blank, the build fails with
   > `npm error ... Could not read package.json` / `ENOENT`. It also lets Cloudflare find
   > `functions/` (relative to the root directory), so the `/api/*` routes deploy
   > automatically — no extra config.

   To change it after the project exists: **Settings → Builds & deployments → Build
   configuration → Edit**, set Root directory to `cryptofolio-web`, save, then **Deployments →
   Retry deployment**.
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
| Deploy fails: `Missing entry-point to Worker script or to assets directory` (after a warning that `wrangler pages deploy` should be used) | The deploy command is `npx wrangler deploy` (the **Workers** command). This is a **Pages** app. This usually means the project was created as a Worker, not Pages — see the next two rows. Recreating as a native Pages project removes the deploy command entirely. |
| Deploy fails: `Authentication error [code: 10000]` on `.../pages/projects/...` | The credentials aren't scoped for Pages. Almost always because the project was created as a **Worker** (its managed build token can't edit Pages projects), or a custom `CLOUDFLARE_API_TOKEN` env var lacks the **Account · Cloudflare Pages · Edit** permission. Fix: recreate as a native **Pages** project (no token needed), or scope the token correctly. Being an account super-admin does **not** scope an API token — tokens are scoped independently. |
| Project was created as a **Worker** instead of Pages (Delete button says "…associated with this **Worker**"; Deployments/Bindings tabs) | Wrong project type for this app. Delete it and recreate via **Create → Pages → Connect to Git** ([Method A](#method-a--cloudflare-dashboard-git-integration)). A native Pages project has no deploy command, auto-publishes `dist/`, and picks up `functions/` for `/api/*`. |
| Project name in the dashboard (e.g. `cryptofolio`) differs from `wrangler.toml` `name` (`cryptofolio-web`) | `wrangler pages deploy` targets the Pages project named in `wrangler.toml`. Keep them equal: name the Pages project `cryptofolio-web`, or edit `wrangler.toml`. |
| Build fails immediately: `npm error ... Could not read package.json` / `ENOENT ... /repo/package.json` | **Root directory** isn't set. It must be `cryptofolio-web` (this is a monorepo). Settings → Builds & deployments → Build configuration → Edit → set it → Retry deployment. |
| Build succeeds but the site is blank / 404 | Check **Build output directory = `dist`** and **Root directory = `cryptofolio-web`** (Method A). |
| `/api/*` returns 404 | Functions weren't detected — ensure the root directory is `cryptofolio-web` so `functions/` sits directly under it. |
| Prices empty, `/api/prices` returns `429` | CoinGecko free-tier rate limit (~30 req/min). Cache + keep-last-known cover normal use; wait a minute if you just added many coins. |
| Build fails on `wrangler` version | This project targets Wrangler 4; `npx wrangler` uses the pinned dev dependency. |
| Refreshing a route 404s | The SPA uses client routing; Pages serves `index.html` for unmatched paths by default, so this normally just works. |

---

## Teardown

Delete the Pages project from **Workers & Pages → your project → Settings → Delete
project**. That removes all deployments; there is nothing else to clean up.
