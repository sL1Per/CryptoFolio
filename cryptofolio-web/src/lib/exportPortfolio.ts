import type { Currency, Holding } from '../types'

export interface PortfolioExport {
  app: 'CryptoFolio'
  version: 1
  exportedAt: string // ISO 8601
  currency: Currency
  holdings: Holding[]
}

/** Build the serializable export payload (pure — no DOM, easy to test). */
export function buildPortfolioExport(
  holdings: Holding[],
  currency: Currency,
  now: Date = new Date(),
): PortfolioExport {
  return {
    app: 'CryptoFolio',
    version: 1,
    exportedAt: now.toISOString(),
    currency,
    holdings,
  }
}

/** Date-stamped filename, e.g. cryptofolio-portfolio-2026-08-03.json */
export function exportFilename(now: Date = new Date()): string {
  return `cryptofolio-portfolio-${now.toISOString().slice(0, 10)}.json`
}

export interface ParsedImport {
  holdings: Holding[]
  currency?: Currency
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
  return { holdings, currency }
}

/** Serialize the portfolio and trigger a browser download. */
export function downloadPortfolioJson(holdings: Holding[], currency: Currency): void {
  const json = JSON.stringify(buildPortfolioExport(holdings, currency), null, 2)
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
