import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePortfolioStore } from './portfolioStore'
import * as coingecko from '../lib/coingecko'
import { POPULAR_COINS } from '../lib/constants'

const BTC = POPULAR_COINS[0] // bitcoin
const ETH = POPULAR_COINS[1] // ethereum

function reset() {
  localStorage.clear()
  usePortfolioStore.setState({
    holdings: [], currency: 'usd', selectedTimeRange: '7D',
    historicalData: [], isLoadingChart: false, chartError: null,
    chartLoadingStatus: '', chartCachedAt: null, chartIsStale: false, chartCache: {},
  })
}

beforeEach(() => { reset(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('fetchHistoricalData', () => {
  it('does nothing with no holdings', async () => {
    await usePortfolioStore.getState().fetchHistoricalData()
    expect(usePortfolioStore.getState().historicalData).toEqual([])
  })

  it('fetches stale coins sequentially and builds portfolio points', async () => {
    usePortfolioStore.getState().addHolding(BTC, 2, 'coinbase')
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory').mockResolvedValue({
      ok: true, points: [{ ts: 1000, price: 10 }, { ts: 2000, price: 20 }],
    })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync()
    await p
    expect(spy).toHaveBeenCalledWith('bitcoin', '7D', 'usd')
    expect(usePortfolioStore.getState().historicalData).toEqual([
      { date: 1000, value: 20 }, { date: 2000, value: 40 },
    ])
    expect(usePortfolioStore.getState().isLoadingChart).toBe(false)
    expect(usePortfolioStore.getState().chartIsStale).toBe(false)
    expect(usePortfolioStore.getState().chartError).toBeNull()
  })

  it('spaces multiple coin fetches 1.5s apart', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    usePortfolioStore.getState().addHolding(ETH, 1, 'coinbase')
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory').mockResolvedValue({ ok: true, points: [{ ts: 1000, price: 1 }] })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.advanceTimersByTimeAsync(0)
    expect(spy).toHaveBeenCalledTimes(1) // first coin immediately
    await vi.advanceTimersByTimeAsync(1500)
    expect(spy).toHaveBeenCalledTimes(2) // second after 1.5s
    await vi.runAllTimersAsync(); await p
  })

  it('on 429 waits 15s, retries once, and keeps data on success', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory')
      .mockResolvedValueOnce({ ok: false, rateLimited: true })
      .mockResolvedValueOnce({ ok: true, points: [{ ts: 1000, price: 5 }] })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync(); await p
    expect(spy).toHaveBeenCalledTimes(2)
    expect(usePortfolioStore.getState().historicalData).toEqual([{ date: 1000, value: 5 }])
    expect(usePortfolioStore.getState().chartError).toBeNull()
  })

  it('sets an error only when nothing is available after a double 429', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    vi.spyOn(coingecko, 'fetchCoinHistory').mockResolvedValue({ ok: false, rateLimited: true })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync(); await p
    expect(usePortfolioStore.getState().historicalData).toEqual([])
    expect(usePortfolioStore.getState().chartError).toBe('Rate limited. Try again in a minute.')
  })

  it('renders cache first and skips fetching when cache is fresh', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    usePortfolioStore.setState({
      chartCache: { 'bitcoin|usd|7D': { coinId: 'bitcoin', currency: 'usd', range: '7D', fetchedAt: Date.now(), points: [{ ts: 1000, price: 9 }] } },
    })
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory')
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync(); await p
    expect(spy).not.toHaveBeenCalled()
    expect(usePortfolioStore.getState().historicalData).toEqual([{ date: 1000, value: 9 }])
  })
})
