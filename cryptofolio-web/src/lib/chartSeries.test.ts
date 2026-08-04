import { describe, it, expect } from 'vitest'
import { buildTokenOptions } from './chartSeries'
import type { CoinPrice, Holding } from '../types'

const hold = (id: string, symbol: string, amount: number, exchangeId = 'coinbase'): Holding => ({
  id: `${id}-${exchangeId}`,
  coin: { id, symbol, name: symbol },
  amount,
  exchangeId,
})

const price = (usd: number): CoinPrice => ({ usd, eur: usd, usd_24h_change: 0, eur_24h_change: 0 })

describe('buildTokenOptions', () => {
  it('dedupes holdings by coin id, summing amounts', () => {
    const holdings = [hold('bitcoin', 'BTC', 1, 'kraken'), hold('bitcoin', 'BTC', 2, 'coinbase')]
    const opts = buildTokenOptions(holdings, {}, 'usd')
    expect(opts).toEqual([{ id: 'bitcoin', symbol: 'BTC' }])
  })

  it('orders by holding value (amount × price) descending', () => {
    const holdings = [hold('bitcoin', 'BTC', 1), hold('ethereum', 'ETH', 10)]
    const prices = { bitcoin: price(100), ethereum: price(50) } // BTC=100, ETH=500
    expect(buildTokenOptions(holdings, prices, 'usd').map((o) => o.symbol)).toEqual(['ETH', 'BTC'])
  })

  it('uses the selected currency for valuation', () => {
    const holdings = [hold('bitcoin', 'BTC', 1), hold('ethereum', 'ETH', 1)]
    const prices = {
      bitcoin: { usd: 100, eur: 1, usd_24h_change: 0, eur_24h_change: 0 },
      ethereum: { usd: 1, eur: 100, usd_24h_change: 0, eur_24h_change: 0 },
    }
    expect(buildTokenOptions(holdings, prices, 'eur').map((o) => o.symbol)).toEqual(['ETH', 'BTC'])
  })

  it('falls back to alphabetical order when prices are unavailable', () => {
    const holdings = [hold('solana', 'SOL', 1), hold('bitcoin', 'BTC', 1), hold('ethereum', 'ETH', 1)]
    expect(buildTokenOptions(holdings, {}, 'usd').map((o) => o.symbol)).toEqual(['BTC', 'ETH', 'SOL'])
  })

  it('sorts priced tokens ahead of unpriced ones', () => {
    const holdings = [hold('solana', 'SOL', 1), hold('bitcoin', 'BTC', 1)]
    const prices = { bitcoin: price(100) } // solana unpriced
    expect(buildTokenOptions(holdings, prices, 'usd').map((o) => o.symbol)).toEqual(['BTC', 'SOL'])
  })
})
