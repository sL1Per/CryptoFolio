import { useState } from 'react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { holdingsByToken } from '../../store/selectors'
import { useSnapshot } from './useSnapshot'
import { TokenCard } from './TokenCard'
import { TokenBreakdownModal } from './TokenBreakdownModal'
import type { AggregatedHolding } from '../../types'

export function TokenGroupedGrid() {
  const snap = useSnapshot()
  const coinImages = usePortfolioStore((s) => s.coinImages)
  const [selected, setSelected] = useState<AggregatedHolding | null>(null)
  const tokens = holdingsByToken(snap)

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tokens.map((agg) => (
          <TokenCard key={agg.coin.id} agg={agg} snap={snap} imageUrl={coinImages[agg.coin.id]} onClick={() => setSelected(agg)} />
        ))}
      </div>
      <TokenBreakdownModal agg={selected} snap={snap} open={selected !== null} onClose={() => setSelected(null)} />
    </>
  )
}
