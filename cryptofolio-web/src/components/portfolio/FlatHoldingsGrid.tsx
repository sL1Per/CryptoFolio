import { usePortfolioStore } from '../../store/portfolioStore'
import { sortedHoldings } from '../../store/selectors'
import { useSnapshot } from './useSnapshot'
import { HoldingCard } from './HoldingCard'

export function FlatHoldingsGrid() {
  const snap = useSnapshot()
  const coinImages = usePortfolioStore((s) => s.coinImages)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sortedHoldings(snap).map((h) => (
        <HoldingCard key={h.id} holding={h} snap={snap} imageUrl={coinImages[h.coin.id]} />
      ))}
    </div>
  )
}
