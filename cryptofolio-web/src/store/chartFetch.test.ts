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
    expect(spy).toHaveBeenCalledWith('bitcoin', '7D', 'usd', '')
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

  it('a superseded invocation (currency switched mid-flight) does not overwrite newer state', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    usePortfolioStore.getState().addHolding(ETH, 1, 'coinbase')
    // Invocation 1 (gen1) will fetch bitcoin, then hit its between-coin sleep(1500)
    // and suspend there. Invocation 2 (gen2) supersedes it before that sleep fires.
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory')
      .mockResolvedValue({ ok: true, points: [{ ts: 1000, price: 100 }] })
    const p1 = usePortfolioStore.getState().fetchHistoricalData()
    await vi.advanceTimersByTimeAsync(0) // gen1 fetches bitcoin (call 1), now sleeping before ethereum
    expect(spy).toHaveBeenCalledTimes(1)

    // Supersede: start a second invocation (as a currency/range switch effect would),
    // now resolving with different prices so gen2's writes are distinguishable.
    spy.mockResolvedValue({ ok: true, points: [{ ts: 1000, price: 999 }] })
    const p2 = usePortfolioStore.getState().fetchHistoricalData(true)
    await vi.runAllTimersAsync()
    await Promise.all([p1, p2])

    // Discriminating assertion: with the generation guard, gen1's between-coin sleep
    // resolves to a superseded check that returns early, so gen1 NEVER fetches
    // ethereum. Only 3 calls happen total: bitcoin (gen1), bitcoin (gen2), ethereum
    // (gen2). Without the guard, gen1 would resume and also fetch ethereum -> 4 calls.
    // This is the property that actually breaks if the guard regresses.
    expect(spy).toHaveBeenCalledTimes(3)

    // Final state must reflect invocation 2 (price 999 per coin), not a late write
    // from invocation 1 (price 100) landing after invocation 2 has already finished.
    const data = usePortfolioStore.getState().historicalData
    expect(data.length).toBeGreaterThan(0)
    // 2 holdings (BTC + ETH), each contributing 999 at ts=1000 -> portfolio value 1998.
    expect(data.every((pt) => pt.value === 999 * 2)).toBe(true)
    expect(usePortfolioStore.getState().isLoadingChart).toBe(false)
  })
})
