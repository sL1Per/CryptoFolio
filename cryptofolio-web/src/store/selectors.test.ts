import { describe, it, expect } from 'vitest'
import {
  priceFor,
  totalValue,
  totalChange24h,
  sortedHoldings,
  holdingsByToken,
  holdingsByExchange,
  type PortfolioSnapshot,
} from './selectors'
import type { Holding } from '../types'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const eth = { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

function hold(coin: typeof btc, amount: number, ex: string): Holding {
  return { id: `${coin.id}-${ex}`, coin, amount, exchangeId: ex }
}

const snap: PortfolioSnapshot = {
  currency: 'usd',
  sortMode: 'value',
  holdings: [hold(btc, 1, 'coinbase'), hold(btc, 0.5, 'kraken'), hold(eth, 10, 'coinbase')],
  prices: {
    bitcoin: { usd: 100, eur: 90, usd_24h_change: 2, eur_24h_change: 1 },
    ethereum: { usd: 5, eur: 4, usd_24h_change: -3, eur_24h_change: -2 },
  },
}

describe('selectors', () => {
  it('priceFor reads the active currency', () => {
    expect(priceFor(snap, 'bitcoin')).toBe(100)
    expect(priceFor({ ...snap, currency: 'eur' }, 'bitcoin')).toBe(90)
  })

  it('totalValue sums price * amount', () => {
    // btc: 1.5 * 100 = 150 ; eth: 10 * 5 = 50
    expect(totalValue(snap)).toBe(200)
  })

  it('totalChange24h sums weighted daily change', () => {
    // btc: 100*1.5*2/100 = 3 ; eth: 5*10*-3/100 = -1.5
    expect(totalChange24h(snap)).toBeCloseTo(1.5)
  })

  it('sortedHoldings by value is descending', () => {
    const s = sortedHoldings(snap).map((h) => h.id)
    // btc-coinbase 100 > btc-kraken 50 > eth-coinbase 50 (stable)
    expect(s[0]).toBe('bitcoin-coinbase')
  })

  it('holdingsByToken aggregates amounts + breakdown', () => {
    const t = holdingsByToken(snap)
    const btcAgg = t.find((a) => a.coin.id === 'bitcoin')!
    expect(btcAgg.totalAmount).toBe(1.5)
    expect(btcAgg.breakdown).toHaveLength(2)
  })

  it('holdingsByExchange groups + totals, sorted desc', () => {
    const g = holdingsByExchange(snap)
    // coinbase: btc 100 + eth 50 = 150 ; kraken: btc 50
    expect(g[0].exchange.id).toBe('coinbase')
    expect(g[0].totalValue).toBe(150)
  })

  it('treats missing prices as zero', () => {
    const empty: PortfolioSnapshot = { ...snap, prices: {} }
    expect(totalValue(empty)).toBe(0)
  })
})
