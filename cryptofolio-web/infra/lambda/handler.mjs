// CryptoFolio API proxy — AWS Lambda (Function URL, payload format v2.0), Node 20+.
//
// One handler ports the three Cloudflare Pages Functions (prices, images, history)
// into a single Lambda that proxies CoinGecko's free API. It is meant to sit behind
// CloudFront on the `/api/*` behavior, same origin as the S3-hosted SPA — so the
// frontend's relative `/api/...` calls work unchanged and there is no CORS.
//
// Caching has two layers:
//   1. CloudFront caches each `/api/*` URL for the fresh window, driven by the
//      `Cache-Control: public, max-age=<ttl>` this handler returns on a hit/miss.
//   2. An in-memory `lastKnown` map (module scope, survives across invocations on a
//      warm container) keeps the last successful body per key, so a CoinGecko 429
//      returns stale data ("keep-last-known") instead of blanking the UI.
//
// `now`/`fetch` are injectable for testing; the Lambda runtime calls handler(event)
// with the real Date.now and global fetch.

const UA = 'CryptoFolio/1.0 (+https://cryptofolio.app)'
const COINGECKO = 'https://api.coingecko.com/api/v3'

// key -> { at: epochMs, body: string }
const lastKnown = new Map()

// Per-days fresh TTLs, matching the original Pages Functions.
const HISTORY_TTL_MS = { 7: 600_000, 30: 3_600_000, 365: 21_600_000, 1825: 86_400_000 }

// ---------- helpers ----------

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}

// max-age > 0 → CloudFront may cache; otherwise no-store so stale/errors re-ask soon.
function cacheHeaders(maxAgeMs, status) {
  const secs = Math.max(0, Math.floor(maxAgeMs / 1000))
  return secs > 0
    ? { 'Cache-Control': `public, max-age=${secs}`, 'x-cache-status': status }
    : { 'Cache-Control': 'no-store', 'x-cache-status': status }
}

function parseIds(raw) {
  if (!raw) return null
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].sort()
  return ids.length ? ids.slice(0, 250) : null
}

export function imagesTransform(j) {
  return Object.fromEntries(
    (Array.isArray(j) ? j : [])
      .filter((m) => m && typeof m.id === 'string' && typeof m.image === 'string')
      .map((m) => [m.id, m.image]),
  )
}

export function historyTransform(j) {
  const raw = j?.prices
  if (!Array.isArray(raw)) return { prices: [] }
  const prices = raw
    .filter((p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
    .map((p) => [p[0], p[1]])
  return { prices }
}

// ---------- core proxy ----------

async function proxy({ key, upstreamUrl, freshTtlMs, transform }, deps) {
  const now = deps.now()
  const hit = lastKnown.get(key)

  // Fresh: serve from memory without touching upstream. Remaining TTL becomes the
  // CloudFront max-age so the edge stops re-asking exactly when the data goes stale.
  if (hit && now - hit.at < freshTtlMs) {
    return json(200, hit.body, cacheHeaders(freshTtlMs - (now - hit.at), 'fresh'))
  }

  try {
    const upstream = await deps.fetch(upstreamUrl, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!upstream.ok) {
      const err = new Error(`upstream ${upstream.status}`)
      err.status = upstream.status
      throw err
    }
    const body = JSON.stringify(transform(await upstream.json()))
    lastKnown.set(key, { at: now, body })
    return json(200, body, cacheHeaders(freshTtlMs, 'miss'))
  } catch (err) {
    // Keep-last-known: never blank the UI on a transient upstream failure.
    if (hit) return json(200, hit.body, cacheHeaders(0, 'stale'))
    if (err?.status === 429) return json(429, { error: 'rate_limited' }, cacheHeaders(0, 'rate-limited'))
    return json(502, { error: 'upstream_error' }, cacheHeaders(0, 'error'))
  }
}

// ---------- router ----------

export const handler = async (event, deps = {}) => {
  const now = deps.now ?? (() => Date.now())
  const fetchFn = deps.fetch ?? globalThis.fetch
  const d = { now, fetch: fetchFn }

  const method = event?.requestContext?.http?.method ?? 'GET'
  if (method !== 'GET') return json(405, { error: 'method_not_allowed' }, cacheHeaders(0, 'error'))

  const path = event?.rawPath ?? '/'
  const qs = new URLSearchParams(event?.rawQueryString ?? '')

  if (path === '/api/prices') {
    const ids = parseIds(qs.get('ids'))
    if (!ids) return json(400, { error: 'missing ids' })
    const p = ids.join(',')
    return proxy(
      {
        key: `prices:${p}`,
        upstreamUrl: `${COINGECKO}/simple/price?ids=${p}&vs_currencies=usd,eur&include_24hr_change=true`,
        freshTtlMs: 60_000,
        transform: (x) => x,
      },
      d,
    )
  }

  if (path === '/api/images') {
    const ids = parseIds(qs.get('ids'))
    if (!ids) return json(400, { error: 'missing ids' })
    const p = ids.join(',')
    return proxy(
      {
        key: `images:${p}`,
        upstreamUrl: `${COINGECKO}/coins/markets?vs_currency=usd&ids=${p}&per_page=250&sparkline=false`,
        freshTtlMs: 86_400_000,
        transform: imagesTransform,
      },
      d,
    )
  }

  const hist = path.match(/^\/api\/history\/([a-z0-9-]+)$/)
  if (hist) {
    const id = hist[1]
    const days = Number(qs.get('days'))
    const vs = qs.get('vs')
    if (!HISTORY_TTL_MS[days] || (vs !== 'usd' && vs !== 'eur')) {
      return json(400, { error: 'invalid request' })
    }
    return proxy(
      {
        key: `history:${id}:${days}:${vs}`,
        upstreamUrl: `${COINGECKO}/coins/${id}/market_chart?vs_currency=${vs}&days=${days}&precision=2`,
        freshTtlMs: HISTORY_TTL_MS[days],
        transform: historyTransform,
      },
      d,
    )
  }

  return json(404, { error: 'not_found' })
}
