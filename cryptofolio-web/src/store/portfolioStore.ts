import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Coin, CoinPrice, Currency, GroupMode, Holding, SortMode, TimeRange, PortfolioDataPoint } from '../types'
import { newHolding } from '../types'
import * as coingecko from '../lib/coingecko'
import { RateLimitedError, fetchCoinHistory } from '../lib/coingecko'
import {
  loadChartCache, saveChartCache, chartCacheKey, isCacheValid, type ChartCache, type ChartCacheEntry,
} from '../lib/cache'
import { buildPortfolioDataPoints } from '../lib/portfolioHistory'

export const FETCH_SPACING_MS = 1500
export const RATE_LIMIT_WAIT_MS = 15000
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface PortfolioState {
  holdings: Holding[]
  groupMode: GroupMode
  sortMode: SortMode
  currency: Currency

  // Live-data fields (populated in Phase 2; empty here)
  prices: Record<string, CoinPrice>
  coinImages: Record<string, string>
  isLoading: boolean
  lastUpdated: number | null
  errorMessage: string | null

  // Chart (transient — not persisted)
  selectedTimeRange: TimeRange
  historicalData: PortfolioDataPoint[]
  isLoadingChart: boolean
  chartError: string | null
  chartLoadingStatus: string
  chartCachedAt: number | null
  chartIsStale: boolean
  chartCache: ChartCache

  addHolding: (coin: Coin, amount: number, exchangeId: string) => void
  updateHolding: (id: string, amount: number, exchangeId: string) => void
  removeHolding: (id: string) => void
  setGroupMode: (mode: GroupMode) => void
  setSortMode: (mode: SortMode) => void
  setCurrency: (currency: Currency) => void
  fetchPrices: () => Promise<void>
  setTimeRange: (range: TimeRange) => void
  fetchHistoricalData: (forceRefresh?: boolean) => Promise<void>
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      holdings: [],
      groupMode: 'token',
      sortMode: 'value',
      currency: 'usd',
      prices: {},
      coinImages: {},
      isLoading: false,
      lastUpdated: null,
      errorMessage: null,

      selectedTimeRange: '7D',
      historicalData: [],
      isLoadingChart: false,
      chartError: null,
      chartLoadingStatus: '',
      chartCachedAt: null,
      chartIsStale: false,
      chartCache: loadChartCache(),

      addHolding: (coin, amount, exchangeId) =>
        set((s) => ({ holdings: [...s.holdings, newHolding(coin, amount, exchangeId)] })),

      updateHolding: (id, amount, exchangeId) =>
        set((s) => ({
          holdings: s.holdings.map((h) => (h.id === id ? { ...h, amount, exchangeId } : h)),
        })),

      removeHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),

      setGroupMode: (groupMode) => set({ groupMode }),
      setSortMode: (sortMode) => set({ sortMode }),
      setCurrency: (currency) => set({ currency }),
      fetchPrices: async () => {
        const ids = [...new Set(get().holdings.map((h) => h.coin.id))]
        if (ids.length === 0) return
        set({ isLoading: true, errorMessage: null })
        try {
          const prices = await coingecko.fetchPrices(ids)
          set({ prices, lastUpdated: Date.now() })
        } catch (err) {
          set({
            errorMessage:
              err instanceof RateLimitedError
                ? 'Rate limited — showing last known prices'
                : 'Could not update prices — showing last known values',
          })
        } finally {
          set({ isLoading: false })
        }
        // Images: best-effort, only for coins missing one; never surfaces an error.
        const missing = ids.filter((id) => !get().coinImages[id])
        if (missing.length > 0) {
          try {
            const images = await coingecko.fetchImages(missing)
            set((s) => ({ coinImages: { ...s.coinImages, ...images } }))
          } catch {
            /* ignore image failures */
          }
        }
      },

      setTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),

      fetchHistoricalData: async (forceRefresh = false) => {
        const { holdings, currency, selectedTimeRange: range } = get()
        if (holdings.length === 0) { set({ historicalData: [] }); return }

        const cur = currency
        const uniqueIds = [...new Set(holdings.map((h) => h.coin.id))]
        const amountByCoin: Record<string, number> = {}
        for (const h of holdings) amountByCoin[h.coin.id] = (amountByCoin[h.coin.id] ?? 0) + h.amount

        const now = () => Date.now()
        const keyOf = (id: string) => chartCacheKey(id, cur, range)

        // Build a histories dict from whatever is cached (ignoring TTL).
        const historiesFromCache = (cache: ChartCache) => {
          const result: Record<string, { ts: number; price: number }[]> = {}
          for (const id of uniqueIds) {
            const entry = cache[keyOf(id)]
            if (entry) result[id] = entry.points
          }
          return result
        }
        const cachedAtOf = (cache: ChartCache, ids: string[]) => {
          const stamps = ids.map((id) => cache[keyOf(id)]?.fetchedAt).filter((v): v is number => v != null)
          return stamps.length ? Math.min(...stamps) : null
        }
        const stalenessOf = (cache: ChartCache) =>
          uniqueIds.some((id) => {
            const entry = cache[keyOf(id)]
            return !entry || !isCacheValid(entry, now())
          })

        // Step 1: render cache first, always.
        let cache = get().chartCache
        const cachedHistories = historiesFromCache(cache)
        if (Object.keys(cachedHistories).length > 0) {
          set({
            historicalData: buildPortfolioDataPoints(cachedHistories, amountByCoin),
            chartCachedAt: cachedAtOf(cache, Object.keys(cachedHistories)),
            chartIsStale: stalenessOf(cache),
            chartError: null,
          })
        }

        // Step 2: which coins need fetching?
        const staleIds = uniqueIds.filter((id) => {
          const entry = cache[keyOf(id)]
          return forceRefresh || !entry || !isCacheValid(entry, now())
        })
        if (staleIds.length === 0) {
          set({ isLoadingChart: false, chartLoadingStatus: '', chartIsStale: false })
          return
        }

        set({ isLoadingChart: true })

        const accumulated: Record<string, { ts: number; price: number }[]> = { ...cachedHistories }
        const writeEntry = (id: string, points: { ts: number; price: number }[]) => {
          const entry: ChartCacheEntry = { coinId: id, currency: cur, range, fetchedAt: now(), points }
          cache = { ...cache, [keyOf(id)]: entry }
          set({ chartCache: cache })
          saveChartCache(cache)
          accumulated[id] = points
          set({
            historicalData: buildPortfolioDataPoints(accumulated, amountByCoin),
            chartCachedAt: cachedAtOf(cache, Object.keys(accumulated)),
          })
        }

        for (let i = 0; i < staleIds.length; i++) {
          const id = staleIds[i]
          const displayId = id.toUpperCase().replace('-2', '').replace('-NETWORK', '')
          set({ chartLoadingStatus: `Updating ${displayId}… (${i + 1}/${staleIds.length})` })
          if (i > 0) await sleep(FETCH_SPACING_MS)

          const result = await fetchCoinHistory(id, range, cur)
          if (result.ok) {
            writeEntry(id, result.points)
          } else if (result.rateLimited) {
            set({ chartLoadingStatus: 'Rate limited — waiting 15s to retry…' })
            await sleep(RATE_LIMIT_WAIT_MS)
            const retry = await fetchCoinHistory(id, range, cur)
            if (retry.ok) {
              writeEntry(id, retry.points)
            } else {
              set({ chartLoadingStatus: '' })
              if (get().historicalData.length === 0) set({ chartError: 'Rate limited. Try again in a minute.' })
              break
            }
          } else {
            if (get().historicalData.length === 0) set({ chartError: 'Could not load chart data.' })
          }
        }

        set({ isLoadingChart: false, chartLoadingStatus: '', chartIsStale: stalenessOf(cache) })
      },
    }),
    {
      name: 'cryptofolio_holdings_v2',
      partialize: (s) => ({
        holdings: s.holdings,
        currency: s.currency,
        groupMode: s.groupMode,
        sortMode: s.sortMode,
      }),
    },
  ),
)
