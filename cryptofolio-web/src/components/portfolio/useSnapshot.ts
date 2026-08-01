import { usePortfolioStore } from '../../store/portfolioStore'
import type { PortfolioSnapshot } from '../../store/selectors'

export function useSnapshot(): PortfolioSnapshot {
  return usePortfolioStore((s) => ({
    holdings: s.holdings,
    prices: s.prices,
    currency: s.currency,
    sortMode: s.sortMode,
  }))
}
