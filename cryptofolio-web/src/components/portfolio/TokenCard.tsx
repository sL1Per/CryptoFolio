import type { AggregatedHolding } from '../../types'
import { priceFor, dailyChangeFor, type PortfolioSnapshot } from '../../store/selectors'
import { formatCurrency, formatAmount } from '../../lib/formatters'
import { CoinImage } from '../ui/CoinImage'
import { ChangeBadge } from '../ui/ChangeBadge'

export function TokenCard({
  agg,
  snap,
  imageUrl,
  onClick,
}: {
  agg: AggregatedHolding
  snap: PortfolioSnapshot
  imageUrl?: string
  onClick: () => void
}) {
  const price = priceFor(snap, agg.coin.id) ?? 0
  const value = price * agg.totalAmount
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card-bg p-4 text-left transition-colors hover:border-border-hover hover:bg-card-bg-hover"
    >
      <div className="flex items-center gap-2">
        <CoinImage coin={agg.coin} imageUrl={imageUrl} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">{agg.coin.symbol}</span>
          <span className="text-xs text-text-tertiary">{agg.breakdown.length} location{agg.breakdown.length > 1 ? 's' : ''}</span>
        </div>
        <div className="ml-auto text-xs">
          <ChangeBadge change={dailyChangeFor(snap, agg.coin.id)} />
        </div>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-secondary">{formatAmount(agg.totalAmount)} {agg.coin.symbol}</span>
        <span className="text-sm font-semibold text-text-primary">{formatCurrency(value, snap.currency)}</span>
      </div>
    </button>
  )
}
