import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Coin, CoinPrice, Currency, GroupMode, Holding, SortMode } from '../types'
import { newHolding } from '../types'

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

  addHolding: (coin: Coin, amount: number, exchangeId: string) => void
  updateHolding: (id: string, amount: number, exchangeId: string) => void
  removeHolding: (id: string) => void
  setGroupMode: (mode: GroupMode) => void
  setSortMode: (mode: SortMode) => void
  setCurrency: (currency: Currency) => void
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set) => ({
      holdings: [],
      groupMode: 'token',
      sortMode: 'value',
      currency: 'usd',
      prices: {},
      coinImages: {},
      isLoading: false,
      lastUpdated: null,
      errorMessage: null,

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
