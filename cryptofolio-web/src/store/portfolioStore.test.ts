import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { usePortfolioStore } from './portfolioStore'
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
