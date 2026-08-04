import type { Currency, Exchange, Holding } from '../types'

export interface PortfolioExport {
  app: 'CryptoFolio'
  version: 2
  exportedAt: string // ISO 8601
  currency: Currency
  holdings: Holding[]
  customExchanges: Exchange[]
  apiKey?: string // user's CoinGecko key; only present when one is configured
}

/** Build the serializable export payload (pure — no DOM, easy to test). */
export function buildPortfolioExport(
  holdings: Holding[],
  currency: Currency,
  customExchanges: Exchange[] = [],
  now: Date = new Date(),
  apiKey = '',
): PortfolioExport {
  return {
    app: 'CryptoFolio',
    version: 2,
    exportedAt: now.toISOString(),
    currency,
    holdings,
    customExchanges,
    ...(apiKey ? { apiKey } : {}),
  }
}

/** Date-stamped filename, e.g. cryptofolio-portfolio-2026-08-03.json */
export function exportFilename(now: Date = new Date()): string {
  return `cryptofolio-portfolio-${now.toISOString().slice(0, 10)}.json`
}

export interface ParsedImport {
  holdings: Holding[]
  currency?: Currency
  customExchanges?: Exchange[]
  apiKey?: string
}

function toExchange(raw: unknown, i: number): Exchange {
  if (!raw || typeof raw !== 'object') throw new Error(`Custom exchange #${i + 1} is malformed.`)
  const e = raw as Record<string, unknown>
  if (
    typeof e.id !== 'string' || e.id.length === 0 ||
    typeof e.name !== 'string' ||
    typeof e.color !== 'string' ||
    typeof e.domain !== 'string'
  )
    throw new Error(`Custom exchange #${i + 1} is missing required fields.`)
  return { id: e.id, name: e.name, color: e.color, domain: e.domain }
}

function toHolding(raw: unknown, i: number): Holding {
  if (!raw || typeof raw !== 'object') throw new Error(`Holding #${i + 1} is malformed.`)
  const h = raw as Record<string, unknown>
  const coin = h.coin as Record<string, unknown> | undefined
  if (!coin || typeof coin.id !== 'string' || typeof coin.symbol !== 'string' || typeof coin.name !== 'string')
    throw new Error(`Holding #${i + 1} is missing coin data.`)
  if (typeof h.amount !== 'number' || !Number.isFinite(h.amount))
    throw new Error(`Holding #${i + 1} has an invalid amount.`)
  if (typeof h.exchangeId !== 'string' || h.exchangeId.length === 0)
    throw new Error(`Holding #${i + 1} is missing an exchange.`)
  return {
    id: typeof h.id === 'string' ? h.id : crypto.randomUUID(),
    coin: { id: coin.id, symbol: coin.symbol, name: coin.name },
    amount: h.amount,
    exchangeId: h.exchangeId,
  }
}

/**
 * Parse and validate a JSON string produced by {@link buildPortfolioExport}.
 * Throws an Error with a user-facing message when the file is unusable.
 */
export function parsePortfolioImport(text: string): ParsedImport {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }
  if (!data || typeof data !== 'object') throw new Error('Unrecognized file format.')
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.holdings)) throw new Error('No holdings found in file.')
  const holdings = obj.holdings.map((raw, i) => toHolding(raw, i))
  const currency = obj.currency === 'usd' || obj.currency === 'eur' ? obj.currency : undefined
  const customExchanges = Array.isArray(obj.customExchanges)
    ? obj.customExchanges.map((raw, i) => toExchange(raw, i))
    : undefined
  const apiKey = typeof obj.apiKey === 'string' && obj.apiKey.length > 0 ? obj.apiKey : undefined
  return { holdings, currency, customExchanges, apiKey }
}

/** Serialize the portfolio and trigger a browser download. */
export function downloadPortfolioJson(
  holdings: Holding[],
  currency: Currency,
  customExchanges: Exchange[] = [],
  apiKey = '',
): void {
  const json = JSON.stringify(buildPortfolioExport(holdings, currency, customExchanges, new Date(), apiKey), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFilename()
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
