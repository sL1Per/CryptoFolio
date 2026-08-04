import type { CoinPrice, Currency, Holding } from '../types'

export interface TokenSeriesOption {
  id: string
  symbol: string
}

/**
 * Unique held coins for the chart's per-token selector, ordered by current holding
 * value (amount × price) descending. Tokens without a known price sort last, then
 * alphabetically by symbol — so the ordering is stable before prices load.
 */
export function buildTokenOptions(
  holdings: Holding[],
  prices: Record<string, CoinPrice>,
  currency: Currency,
): TokenSeriesOption[] {
  const byId = new Map<string, { symbol: string; amount: number }>()
  for (const h of holdings) {
    const entry = byId.get(h.coin.id)
    if (entry) entry.amount += h.amount
    else byId.set(h.coin.id, { symbol: h.coin.symbol, amount: h.amount })
  }

  const valueOf = (id: string, amount: number): number | null => {
    const p = prices[id]?.[currency]
    return p != null ? p * amount : null
  }

  return [...byId.entries()]
    .map(([id, { symbol, amount }]) => ({ id, symbol, value: valueOf(id, amount) }))
    .sort((a, b) => {
      if (a.value != null && b.value != null) return b.value - a.value
      if (a.value != null) return -1
      if (b.value != null) return 1
      return a.symbol.localeCompare(b.symbol)
    })
    .map(({ id, symbol }) => ({ id, symbol }))
}
