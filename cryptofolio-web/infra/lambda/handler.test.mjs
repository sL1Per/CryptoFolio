import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handler } from './handler.mjs'

// Build a Lambda Function URL (payload v2.0) event.
const event = (path, query = '') => ({
  rawPath: path,
  rawQueryString: query,
  requestContext: { http: { method: 'GET' } },
})

const ok = (body) => new Response(JSON.stringify(body), { status: 200 })
const rateLimited = () => new Response('slow down', { status: 429 })

// A controllable clock + fetch stub, injected as deps (mirrors the original
// cacheProxy's injected `now`/`fetchUpstream`). The Lambda runtime calls
// handler(event) with real defaults; tests pass their own.
function harness(responder, startMs = 1_000) {
  const calls = []
  let t = startMs
  return {
    deps: { now: () => t, fetch: async (url) => (calls.push(url), responder(url, calls.length)) },
    calls,
    advance: (ms) => { t += ms },
  }
}

test('GET /api/prices returns upstream JSON and caches within the fresh TTL', async () => {
  const h = harness(() => ok({ bitcoin: { usd: 100, eur: 90 } }))
  const first = await handler(event('/api/prices', 'ids=bitcoin'), h.deps)
  assert.equal(first.statusCode, 200)
  assert.deepEqual(JSON.parse(first.body), { bitcoin: { usd: 100, eur: 90 } })
  assert.equal(first.headers['x-cache-status'], 'miss')
  assert.match(first.headers['Cache-Control'], /max-age=60\b/)

  // Second call within the 60s TTL is served from memory — no new upstream fetch.
  const second = await handler(event('/api/prices', 'ids=bitcoin'), h.deps)
  assert.equal(second.headers['x-cache-status'], 'fresh')
  assert.equal(h.calls.length, 1)
})

test('serves last-known value (stale) when upstream is rate-limited after TTL expiry', async () => {
  // First call succeeds and caches; after the TTL a refetch 429s → return last-known.
  const h = harness((_u, n) => (n === 1 ? ok({ solana: { usd: 20 } }) : rateLimited()))
  const primed = await handler(event('/api/prices', 'ids=solana'), h.deps)
  assert.equal(primed.statusCode, 200)

  h.advance(61_000) // past the 60s fresh TTL → next call refetches
  const stale = await handler(event('/api/prices', 'ids=solana'), h.deps)
  assert.equal(stale.statusCode, 200)
  assert.equal(stale.headers['x-cache-status'], 'stale')
  assert.deepEqual(JSON.parse(stale.body), { solana: { usd: 20 } })
  assert.equal(stale.headers['Cache-Control'], 'no-store')
  assert.equal(h.calls.length, 2)
})

test('returns 429 when rate-limited with nothing cached', async () => {
  const h = harness(() => rateLimited())
  const res = await handler(event('/api/prices', 'ids=neverseen-coin'), h.deps)
  assert.equal(res.statusCode, 429)
  assert.deepEqual(JSON.parse(res.body), { error: 'rate_limited' })
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('missing ids → 400', async () => {
  const h = harness(() => ok({}))
  const res = await handler(event('/api/prices', ''), h.deps)
  assert.equal(res.statusCode, 400)
})

test('validates history days + currency', async () => {
  const h = harness(() => ok({ prices: [] }))
  assert.equal((await handler(event('/api/history/bitcoin', 'days=3&vs=usd'), h.deps)).statusCode, 400)
  assert.equal((await handler(event('/api/history/bitcoin', 'days=7&vs=gbp'), h.deps)).statusCode, 400)
  assert.equal((await handler(event('/api/history/BITCOIN', 'days=7&vs=usd'), h.deps)).statusCode, 404) // bad id shape
})

test('history transform keeps only [ts, price] number pairs', async () => {
  const h = harness(() => ok({ prices: [[1, 2], [3, 'x'], 'nope', [4, 5]] }))
  const res = await handler(event('/api/history/bitcoin', 'days=7&vs=usd'), h.deps)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.body).prices, [[1, 2], [4, 5]])
})

test('images transform maps id -> image and drops incomplete entries', async () => {
  const h = harness(() => ok([{ id: 'bitcoin', image: 'btc.png' }, { id: 'bad' }]))
  const res = await handler(event('/api/images', 'ids=bitcoin'), h.deps)
  assert.deepEqual(JSON.parse(res.body), { bitcoin: 'btc.png' })
})

test('non-GET method → 405', async () => {
  const h = harness(() => ok({}))
  const res = await handler(
    { rawPath: '/api/prices', rawQueryString: 'ids=bitcoin', requestContext: { http: { method: 'POST' } } },
    h.deps,
  )
  assert.equal(res.statusCode, 405)
})

test('unknown path → 404', async () => {
  const h = harness(() => ok({}))
  assert.equal((await handler(event('/api/nonsense'), h.deps)).statusCode, 404)
})
