import { usePortfolioStore } from '../../store/portfolioStore'
import { holdingsByExchange } from '../../store/selectors'
import { useSnapshot } from './useSnapshot'
import { HoldingCard } from './HoldingCard'
import { ExchangeBadge } from '../ui/ExchangeBadge'
import { SectionHeader } from '../ui/SectionHeader'
import { formatCurrency } from '../../lib/formatters'
import type { Holding } from '../../types'

export function ExchangeGroupedGrid({ onEditHolding }: { onEditHolding: (h: Holding) => void }) {
  const snap = useSnapshot()
  const coinImages = usePortfolioStore((s) => s.coinImages)
  return (
    <div className="flex flex-col gap-4">
      {holdingsByExchange(snap).map((group) => (
        <div key={group.exchange.id}>
          <SectionHeader>
            <span className="flex items-center gap-2">
              <ExchangeBadge exchange={group.exchange} /> {group.exchange.name} · {formatCurrency(group.totalValue, snap.currency)}
            </span>
          </SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.holdings.map((h) => (
              <HoldingCard key={h.id} holding={h} snap={snap} imageUrl={coinImages[h.coin.id]} onClick={() => onEditHolding(h)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
