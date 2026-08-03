# Deploying CryptoFolio to the AWS Free Tier

This guide deploys the CryptoFolio web app (Vite + React SPA) plus its CoinGecko proxy
to AWS, staying inside the free tier for a personal deployment.

It mirrors the app's current Cloudflare setup: a static site, and three `/api/*`
endpoints that proxy CoinGecko with caching and keep-last-known-on-rate-limit. On AWS
those become **S3 + CloudFront** (static) and **one Lambda** (the proxy), served under a
single CloudFront domain so the frontend's relative `/api/...` calls work unchanged — no
CORS, no frontend code changes.

There are two provisioning paths. Do **one**:

- **[Path A — Console click-ops](#path-a--console-click-ops)** — follow-along in the AWS
  Console. Best the first time.
- **[Path B — SAM (infrastructure as code)](#path-b--sam-infrastructure-as-code)** — one
  `sam deploy` from `infra/template.yaml`. Reproducible; tear down and rebuild in minutes.

Both deploy the same architecture and the same Lambda code
(`infra/lambda/handler.mjs`).

---

## Architecture

```
                      ┌─────────────── CloudFront distribution ───────────────┐
   browser  ────────▶ │  default behavior  /*     → S3 bucket (SPA, dist/)    │
                      │  /api/* behavior          → Lambda Function URL       │
                      └───────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                                    Lambda (nodejs20.x) — one handler
                                    routes /api/prices · /api/images · /api/history/{id}
                                                          │
                                                          ▼
                                          api.coingecko.com  (free tier)
```

**Caching (replacing the Cloudflare Workers Cache):**

1. **CloudFront** caches each `/api/*` URL for the fresh window, driven by the
   `Cache-Control: public, max-age=<ttl>` the Lambda returns. This is what shields the
   CoinGecko rate limit from repeat traffic.
2. An **in-memory map inside the Lambda** (module scope; survives across invocations on a
   warm container) keeps the last successful body per key, so a CoinGecko `429` returns
   **stale data instead of blanking the UI** — the same "keep-last-known" guarantee as the
   Cloudflare version.

> Tradeoff: the in-memory map is per-container, not globally shared like the Workers Cache.
> For a single-user free-tier deploy this is fine, and CloudFront absorbs the repeat
> traffic anyway. If you ever want a shared cache, see [Hardening & upgrades](#hardening--upgrades).

---

## Free-tier cost

| Service | Free allowance | This app's usage |
|---|---|---|
| **CloudFront** | 1 TB out + 10M requests / month, **always free** | A personal portfolio: well under 1 GB / month |
| **Lambda** | 1M requests + 400,000 GB-s / month, **always free** | Only runs on CloudFront cache misses; a few thousand/month |
| **S3** | 5 GB + 20k GET / 2k PUT / month, free **first 12 months** | `dist/` is ~1–2 MB |
| **CloudFront Functions** | 2M invocations / month, always free | SPA routing only |

Realistically **$0/month** for personal use. The one thing that can cost money is
egregious traffic or leaving a forgotten stack running — set the billing alarm in
[Cost guardrail](#cost-guardrail-do-this-once) and you'll be warned before any charge
matters.

Everything here is **region-agnostic except CloudFront-fronted certs**; use
`us-east-1` to keep things simplest.

---

## Prerequisites

1. **An AWS account.** New accounts get the 12-month free tier on top of the always-free
   services above.
2. **An IAM user (not root)** with programmatic access. Attach `AdministratorAccess` for a
   personal account, or scope to S3/Lambda/CloudFront/CloudFormation if you prefer.
3. **AWS CLI v2** — `aws --version`. Configure it: `aws configure` (set your key, secret,
   `us-east-1`, `json`).
4. **For Path B only: AWS SAM CLI** — `sam --version`.
5. **Node 20+** and the repo checked out.

**Build the app once (both paths need `dist/`):**

```bash
cd cryptofolio-web
npm install
npm run build      # → dist/
```

---

## The proxy Lambda

Both paths deploy `infra/lambda/handler.mjs`. It's already in the repo and unit-tested:

```bash
cd infra/lambda
node --test        # 9 passing tests (routing, caching, keep-last-known, transforms)
```

<details>
<summary>Full <code>infra/lambda/handler.mjs</code> (click to copy-paste if you're not cloning the repo)</summary>

```js
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
```

</details>

---

## Path A — Console click-ops

Roughly 20–30 minutes the first time. Region: **us-east-1**.

### A1. Create the site bucket

1. **S3 → Create bucket.** Name it globally-unique, e.g. `cryptofolio-site-<your-initials>`.
2. Region **us-east-1**. Leave **Block all public access ON** (CloudFront reaches it
   privately). Create.
3. Upload the build:
   ```bash
   aws s3 sync dist/ s3://cryptofolio-site-<your-initials>/ --delete
   ```

### A2. Create the proxy Lambda

1. **Lambda → Create function → Author from scratch.**
   - Name: `cryptofolio-api`
   - Runtime: **Node.js 20.x**, Architecture: `arm64` (cheapest) or `x86_64`.
   - Create.
2. Give it the code. Easiest is a zip:
   ```bash
   cd infra/lambda
   zip -r function.zip handler.mjs        # handler.mjs only; no deps needed
   aws lambda update-function-code \
     --function-name cryptofolio-api \
     --zip-file fileb://function.zip
   ```
   Or paste `handler.mjs` into the inline editor (rename the editor file to `handler.mjs`).
3. **Configuration → General configuration → Edit:** Handler `handler.handler`, Timeout
   `10s`, Memory `128 MB`. Save.
4. **Configuration → Function URL → Create:** Auth type **NONE**, leave CORS off
   (CloudFront makes it same-origin). Copy the URL — you'll need its host in A3.
5. Smoke-test it directly (query strings still work without CloudFront):
   ```bash
   curl "https://<fn-url-host>/api/prices?ids=bitcoin"
   # → {"bitcoin":{"usd":...,"eur":...,"usd_24h_change":...}}
   ```

### A3. Create the CloudFront distribution

1. **CloudFront → Create distribution.**
2. **Origin 1 (site):**
   - Origin domain: pick your S3 bucket (choose the **bucket**, not the website endpoint).
   - Origin access: **Origin access control (OAC)** → *Create control setting* → Sign
     requests → Create.
   - CloudFront shows a banner with an S3 bucket policy to copy — you'll apply it in A4.
3. **Default cache behavior:**
   - Viewer protocol policy: **Redirect HTTP to HTTPS**.
   - Cache policy: **CachingOptimized** (managed).
4. Set **Default root object** to `index.html`. Create the distribution.
5. **Add the API origin & behavior** (edit the distribution after it's created):
   - **Origins → Create origin:** Origin domain = your **Function URL host** (no
     `https://`, no trailing `/`). Protocol: **HTTPS only**.
   - **Behaviors → Create behavior:**
     - Path pattern: `/api/*`
     - Origin: the Lambda origin above
     - Viewer protocol policy: **Redirect HTTP to HTTPS**
     - Cache policy: **Create a custom policy** — TTLs min `0` / default `60` / max `86400`,
       and under *Cache key settings* set **Query strings: All** (this makes
       `?ids=bitcoin` part of the cache key). Save and select it.
     - Origin request policy: **AllViewerExceptHostHeader** (managed) — forwards the query
       string to the Lambda.
6. **SPA routing (so refreshes/deep links don't 403):**
   - **Functions → Create function** (CloudFront Functions), runtime `cloudfront-js-2.0`:
     ```js
     function handler(event) {
       var request = event.request;
       var uri = request.uri;
       if (uri.startsWith('/api/')) return request;      // never touch the API
       if (uri.endsWith('/')) { request.uri = '/index.html'; return request; }
       var last = uri.split('/').pop();
       if (last.indexOf('.') === -1) request.uri = '/index.html';
       return request;
     }
     ```
   - **Publish**, then **Associate** it to the distribution's **Default (`*`) behavior**,
     event type **Viewer request**.

### A4. Apply the S3 bucket policy

Back on the S3 bucket → **Permissions → Bucket policy → Edit**, paste the policy CloudFront
gave you in A2 (it restricts `s3:GetObject` to your distribution via `AWS:SourceArn`). Save.

### A5. Test

Wait for the distribution status to leave *Deploying* (a few minutes), then:

```
https://<distribution-id>.cloudfront.net
```

- The portfolio loads, prices populate, the history chart works.
- `https://<dist>.cloudfront.net/api/prices?ids=bitcoin` returns JSON with an
  `x-cache-status` header (`miss` then `fresh` on repeat).

You're done. Skip to [Redeploying](#redeploying), [Teardown](#teardown), and
[Cost guardrail](#cost-guardrail-do-this-once).

---

## Path B — SAM (infrastructure as code)

Everything above in one stack: `infra/template.yaml`. It provisions the private S3 bucket,
the Lambda + Function URL, the CloudFront distribution with both behaviors, the custom API
cache policy, the SPA-routing CloudFront Function, and the bucket policy.

```bash
cd cryptofolio-web
npm run build                 # ensure dist/ is current

cd infra
sam validate                  # optional sanity check
sam deploy --guided \
  --stack-name cryptofolio \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
# Accept the prompts; save them to samconfig.toml so later deploys are just `sam deploy`.
```

On success, SAM prints outputs. Upload the site and invalidate:

```bash
BUCKET=$(aws cloudformation describe-stacks --stack-name cryptofolio \
  --query "Stacks[0].Outputs[?OutputKey=='SiteBucketName'].OutputValue" --output text)
DIST=$(aws cloudformation describe-stacks --stack-name cryptofolio \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

aws s3 sync ../dist/ "s3://$BUCKET/" --delete
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*"

aws cloudformation describe-stacks --stack-name cryptofolio \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text
```

Open the `SiteUrl` and verify as in [A5](#a5-test).

<details>
<summary>Full <code>infra/template.yaml</code> (click to copy-paste if you're not cloning the repo)</summary>

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: >
  CryptoFolio — static SPA on S3 + CloudFront, with a Lambda (Function URL) that
  proxies CoinGecko under /api/*. Same origin, no CORS. Stays within the AWS free tier
  for a personal deployment.

Parameters:
  ProjectName:
    Type: String
    Default: cryptofolio
    Description: Prefix for resource names.

Globals:
  Function:
    Timeout: 10
    MemorySize: 128
    Runtime: nodejs20.x

Resources:
  # ---------- Static site bucket (private; reachable only via CloudFront OAC) ----------
  SiteBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub '${ProjectName}-site-${AWS::AccountId}'
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  SiteBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref SiteBucket
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Sid: AllowCloudFrontRead
            Effect: Allow
            Principal:
              Service: cloudfront.amazonaws.com
            Action: s3:GetObject
            Resource: !Sub '${SiteBucket.Arn}/*'
            Condition:
              StringEquals:
                AWS:SourceArn: !Sub 'arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}'

  # ---------- API proxy Lambda + public Function URL ----------
  ApiFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub '${ProjectName}-api'
      CodeUri: lambda/
      Handler: handler.handler

  ApiFunctionUrl:
    Type: AWS::Lambda::Url
    Properties:
      TargetFunctionArn: !Ref ApiFunction
      AuthType: NONE

  # Allow public invoke of the Function URL (it is fronted by CloudFront; see the
  # hardening note in DEPLOY_AWS.md to lock it to CloudFront with AWS_IAM + OAC).
  ApiFunctionUrlPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ApiFunction
      Action: lambda:InvokeFunctionUrl
      Principal: '*'
      FunctionUrlAuthType: NONE

  # ---------- CloudFront ----------
  Oac:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub '${ProjectName}-s3-oac'
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  # Cache /api/* by full URL (query string is part of the key) and honor the
  # Cache-Control max-age the Lambda returns.
  ApiCachePolicy:
    Type: AWS::CloudFront::CachePolicy
    Properties:
      CachePolicyConfig:
        Name: !Sub '${ProjectName}-api-cache'
        DefaultTTL: 60
        MinTTL: 0
        MaxTTL: 86400
        ParametersInCacheKeyAndForwardedToOrigin:
          EnableAcceptEncodingBrotli: true
          EnableAcceptEncodingGzip: true
          CookiesConfig:
            CookieBehavior: none
          HeadersConfig:
            HeaderBehavior: none
          QueryStringsConfig:
            QueryStringBehavior: all

  # SPA routing: rewrite extensionless, non-/api paths to /index.html.
  SpaRoutingFunction:
    Type: AWS::CloudFront::Function
    Properties:
      Name: !Sub '${ProjectName}-spa-routing'
      AutoPublish: true
      FunctionConfig:
        Comment: Rewrite SPA routes to index.html, leave /api/* alone
        Runtime: cloudfront-js-2.0
      FunctionCode: |
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          if (uri.startsWith('/api/')) return request;
          if (uri.endsWith('/')) { request.uri = '/index.html'; return request; }
          var last = uri.split('/').pop();
          if (last.indexOf('.') === -1) request.uri = '/index.html';
          return request;
        }

  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        Comment: !Sub '${ProjectName} SPA + API'
        DefaultRootObject: index.html
        HttpVersion: http2and3
        PriceClass: PriceClass_100
        Origins:
          - Id: s3-site
            DomainName: !GetAtt SiteBucket.RegionalDomainName
            OriginAccessControlId: !Ref Oac
            S3OriginConfig:
              OriginAccessIdentity: ''
          - Id: lambda-api
            DomainName: !Select [2, !Split ['/', !GetAtt ApiFunctionUrl.FunctionUrl]]
            CustomOriginConfig:
              OriginProtocolPolicy: https-only
              OriginSSLProtocols: [TLSv1.2]
        DefaultCacheBehavior:
          TargetOriginId: s3-site
          ViewerProtocolPolicy: redirect-to-https
          Compress: true
          # Managed CachingOptimized
          CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6
          FunctionAssociations:
            - EventType: viewer-request
              FunctionARN: !GetAtt SpaRoutingFunction.FunctionMetadata.FunctionARN
        CacheBehaviors:
          - PathPattern: /api/*
            TargetOriginId: lambda-api
            ViewerProtocolPolicy: redirect-to-https
            Compress: true
            CachePolicyId: !Ref ApiCachePolicy
            # Managed AllViewerExceptHostHeader — forwards query strings to the Lambda
            OriginRequestPolicyId: b689b0a8-53d0-40ab-baf2-68738e2966ac
        CustomErrorResponses:
          # S3 returns 403 for missing keys (private bucket). SPA fallback handles
          # routes; this covers any 403 from the site origin without touching /api/*.
          - ErrorCode: 403
            ResponseCode: 200
            ResponsePagePath: /index.html
            ErrorCachingMinTTL: 10

Outputs:
  SiteBucketName:
    Description: Upload the built dist/ here (aws s3 sync dist/ s3://<this>).
    Value: !Ref SiteBucket
  DistributionId:
    Description: CloudFront distribution id (used for cache invalidations).
    Value: !Ref Distribution
  SiteUrl:
    Description: Public site URL.
    Value: !Sub 'https://${Distribution.DomainName}'
  ApiFunctionUrl:
    Description: Direct Lambda URL (normally reached only through CloudFront /api/*).
    Value: !GetAtt ApiFunctionUrl.FunctionUrl
```

</details>

---

## Redeploying

**App code changed** (either path):

```bash
npm run build
aws s3 sync dist/ "s3://$BUCKET/" --delete
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*"
```

CloudFront invalidations: first 1,000 paths/month are free, so `/*` is fine for a hobby app.

**Proxy code changed:**
- Path A: re-zip and `aws lambda update-function-code` (see A2).
- Path B: `sam deploy`.

---

## Teardown

Avoid surprise charges by removing everything when you're done.

**Path B:**
```bash
aws s3 rm "s3://$BUCKET/" --recursive   # empty the bucket first
aws cloudformation delete-stack --stack-name cryptofolio
```

**Path A:** empty and delete the S3 bucket, delete the CloudFront distribution (disable →
wait → delete), delete the Lambda function, and delete the CloudFront Function.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Site loads but prices/chart empty; `/api/...` returns **403 AccessDenied** from S3 XML | The `/api/*` behavior is missing or points at the S3 origin. Ensure the `/api/*` behavior exists and targets the **Lambda** origin. |
| `/api/prices` works but returns the **same data for every coin** | Query string isn't in the cache key. The `/api/*` cache policy must set **Query strings: All**. |
| `/api/history/...` returns 400 | Only `days` ∈ {7,30,365,1825} and `vs` ∈ {usd,eur} are allowed — the app only sends those. |
| Refreshing a route gives a CloudFront/S3 error | The SPA-routing CloudFront Function isn't associated with the **default** behavior as *viewer-request*. |
| CORS error **only when hitting the Function URL directly** in a browser | Expected — the Function URL has no CORS. Use the CloudFront domain (same-origin). `curl` to the Function URL still works. |
| `429 rate_limited` from `/api/*` | CoinGecko's free limit (~30 req/min). CloudFront caching + keep-last-known cover normal use; if you added many coins at once, wait a minute. |
| Lambda **500 / "Cannot find module handler"** | Handler must be `handler.handler` and the file named `handler.mjs`; the zip must contain `handler.mjs` at its root. |

Inspect the `x-cache-status` response header on `/api/*` to see behavior: `miss` (fetched
upstream), `fresh` (served from Lambda memory), `stale` (upstream failed, last-known
served).

---

## Cost guardrail (do this once)

Set a billing alarm so you're notified before any real charge:

1. **Billing → Billing preferences:** enable *Receive Free Tier alerts* and *Receive
   billing alerts*.
2. **CloudWatch (in us-east-1) → Alarms → Create alarm → Metric `Billing → Total
   Estimated Charge (USD)`.** Threshold e.g. **$1**. Notify your email via an SNS topic.

For a personal CryptoFolio deploy you should never trip it.

---

## Hardening & upgrades

Optional; none required for a personal free-tier deploy.

- **Lock the Function URL to CloudFront.** Set the Function URL `AuthType: AWS_IAM`, attach
  an **OAC for the Lambda origin** (`OriginAccessControlOriginType: lambda`), and grant
  CloudFront `lambda:InvokeFunctionUrl`. This stops anyone from invoking the Lambda
  directly and bypassing your cache.
- **Custom domain.** Request an ACM cert **in us-east-1**, add it plus your domain as an
  *Alternate domain name (CNAME)* on the distribution, and point DNS at the CloudFront
  domain.
- **Shared cache across containers.** Replace the in-memory `lastKnown` map with a DynamoDB
  table (on-demand billing is always-free-tier-friendly) if you want keep-last-known shared
  globally rather than per warm container.
- **Tighter security headers.** Attach a CloudFront **response headers policy**
  (HSTS, `X-Content-Type-Options`, a CSP) to the default behavior.
```
