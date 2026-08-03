import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { usePortfolioStore } from './portfolioStore'
import { findExchange } from '../lib/constants'
import * as api from '../lib/coingecko'
import { RateLimitedError } from '../lib/coingecko'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const btc2 = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

describe('portfolioStore', () => {
  beforeEach(() => {
    localStorage.clear()
    usePortfolioStore.setState({ holdings: [], currency: 'usd', groupMode: 'token', sortMode: 'value' })
  })

  it('addHolding appends a holding', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    expect(usePortfolioStore.getState().holdings).toHaveLength(1)
    expect(usePortfolioStore.getState().holdings[0].amount).toBe(2)
  })

  it('updateHolding changes amount + exchange', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    const id = usePortfolioStore.getState().holdings[0].id
    usePortfolioStore.getState().updateHolding(id, 5, 'kraken')
    const h = usePortfolioStore.getState().holdings[0]
    expect(h.amount).toBe(5)
    expect(h.exchangeId).toBe('kraken')
  })

  it('removeHolding deletes by id', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    const id = usePortfolioStore.getState().holdings[0].id
    usePortfolioStore.getState().removeHolding(id)
    expect(usePortfolioStore.getState().holdings).toHaveLength(0)
  })

  it('persists holdings to localStorage', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    expect(localStorage.getItem('cryptofolio_holdings_v2')).toContain('bitcoin')
  })
})

describe('custom exchanges', () => {
  beforeEach(() => {
    localStorage.clear()
    usePortfolioStore.setState({ holdings: [], customExchanges: {} })
  })

  it('addCustomExchange stores and returns a new exchange', () => {
    const ex = usePortfolioStore.getState().addCustomExchange('River Financial', 'river.com')
    expect(ex.id).toBe('custom_river-financial')
    expect(ex.domain).toBe('river.com')
    expect(usePortfolioStore.getState().customExchanges[ex.id]).toEqual(ex)
  })

  it('addCustomExchange dedupes by name and does not overwrite the original', () => {
    const first = usePortfolioStore.getState().addCustomExchange('River', 'river.com')
    const second = usePortfolioStore.getState().addCustomExchange('River', 'different.com')
    expect(second).toEqual(first)
    expect(Object.keys(usePortfolioStore.getState().customExchanges)).toHaveLength(1)
  })

  it('persists custom exchanges to localStorage', () => {
    usePortfolioStore.getState().addCustomExchange('River', 'river.com')
    expect(localStorage.getItem('cryptofolio_holdings_v2')).toContain('custom_river')
  })

  it('makes custom exchanges resolvable via findExchange', () => {
    const ex = usePortfolioStore.getState().addCustomExchange('River', 'river.com')
    expect(findExchange(ex.id)).toEqual(ex)
  })

  it('resetAll clears custom exchanges', () => {
    usePortfolioStore.getState().addCustomExchange('River', 'river.com')
    usePortfolioStore.getState().resetAll()
    expect(usePortfolioStore.getState().customExchanges).toEqual({})
  })

  it('importPortfolio merges imported custom exchanges', () => {
    const custom = { id: 'custom_river', name: 'River', color: 'E8831D', domain: 'river.com' }
    usePortfolioStore.getState().importPortfolio(
      [{ id: 'h1', coin: btc, amount: 1, exchangeId: 'custom_river' }],
      'usd',
      [custom],
    )
    expect(usePortfolioStore.getState().customExchanges['custom_river']).toEqual(custom)
  })
})

describe('resetAll action', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears holdings and restores default group/sort/currency', () => {
    usePortfolioStore.setState({
      holdings: [{ id: 'x', coin: btc, amount: 2, exchangeId: 'coinbase' }],
      currency: 'eur',
      groupMode: 'exchange',
      sortMode: 'name',
    })
    usePortfolioStore.getState().resetAll()
    const s = usePortfolioStore.getState()
    expect(s.holdings).toEqual([])
    expect(s.currency).toBe('usd')
    expect(s.groupMode).toBe('token')
    expect(s.sortMode).toBe('value')
  })

  it('clears live price data and status', () => {
    usePortfolioStore.setState({
      prices: { bitcoin: { usd: 1, eur: 1, usd_24h_change: 0, eur_24h_change: 0 } },
      coinImages: { bitcoin: 'img.png' },
      lastUpdated: 123,
      errorMessage: 'boom',
    })
    usePortfolioStore.getState().resetAll()
    const s = usePortfolioStore.getState()
    expect(s.prices).toEqual({})
    expect(s.coinImages).toEqual({})
    expect(s.lastUpdated).toBeNull()
    expect(s.errorMessage).toBeNull()
  })

  it('clears the chart cache in state and localStorage', () => {
    localStorage.setItem('cryptofolio_chartcache_v1', '[{"coinId":"bitcoin"}]')
    usePortfolioStore.setState({
      chartCache: { 'bitcoin|usd|7D': { coinId: 'bitcoin', currency: 'usd', range: '7D', fetchedAt: 1, points: [] } },
      historicalData: [{ date: 1, value: 5 }],
      chartError: 'err',
      chartCachedAt: 999,
      chartIsStale: true,
    })
    usePortfolioStore.getState().resetAll()
    const s = usePortfolioStore.getState()
    expect(s.chartCache).toEqual({})
    expect(s.historicalData).toEqual([])
    expect(s.chartError).toBeNull()
    expect(s.chartCachedAt).toBeNull()
    expect(s.chartIsStale).toBe(false)
    expect(localStorage.getItem('cryptofolio_chartcache_v1')).toBeNull()
  })
})

afterEach(() => vi.restoreAllMocks())

describe('fetchPrices action', () => {
  it('populates prices + images and sets lastUpdated on success', async () => {
    usePortfolioStore.setState({ holdings: [{ id: 'x', coin: btc2, amount: 1, exchangeId: 'coinbase' }], prices: {}, coinImages: {}, lastUpdated: null, errorMessage: null })
    vi.spyOn(api, 'fetchPrices').mockResolvedValue({ bitcoin: { usd: 100, eur: 90, usd_24h_change: 1, eur_24h_change: 1 } })
    vi.spyOn(api, 'fetchImages').mockResolvedValue({ bitcoin: 'http://img/btc.png' })
    await usePortfolioStore.getState().fetchPrices()
    const s = usePortfolioStore.getState()
    expect(s.prices.bitcoin.usd).toBe(100)
    expect(s.coinImages.bitcoin).toBe('http://img/btc.png')
    expect(s.lastUpdated).toBeTypeOf('number')
    expect(s.isLoading).toBe(false)
    expect(s.errorMessage).toBeNull()
  })

  it('keeps existing prices and sets errorMessage on rate limit', async () => {
    usePortfolioStore.setState({
      holdings: [{ id: 'x', coin: btc2, amount: 1, exchangeId: 'coinbase' }],
      prices: { bitcoin: { usd: 42, eur: 40, usd_24h_change: 0, eur_24h_change: 0 } },
      coinImages: { bitcoin: 'old.png' },
      errorMessage: null,
    })
    vi.spyOn(api, 'fetchPrices').mockRejectedValue(new RateLimitedError())
    vi.spyOn(api, 'fetchImages').mockResolvedValue({})
    await usePortfolioStore.getState().fetchPrices()
    const s = usePortfolioStore.getState()
    expect(s.prices.bitcoin.usd).toBe(42) // retained
    expect(s.errorMessage).toMatch(/rate limited/i)
    expect(s.isLoading).toBe(false)
  })

  it('no-ops with empty holdings', async () => {
    usePortfolioStore.setState({ holdings: [] })
    const spy = vi.spyOn(api, 'fetchPrices').mockResolvedValue({})
    await usePortfolioStore.getState().fetchPrices()
    expect(spy).not.toHaveBeenCalled()
  })
})
