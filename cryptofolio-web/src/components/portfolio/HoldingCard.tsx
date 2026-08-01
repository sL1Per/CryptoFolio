import type { Holding } from '../../types'
import { findExchange } from '../../lib/constants'
import { priceFor, dailyChangeFor, type PortfolioSnapshot } from '../../store/selectors'
import { formatCurrency, formatAmount } from '../../lib/formatters'
import { CoinImage } from '../ui/CoinImage'
import { ExchangeBadge } from '../ui/ExchangeBadge'
import { ChangeBadge } from '../ui/ChangeBadge'
import { usePortfolioStore } from '../../store/portfolioStore'

export function HoldingCard({
  holding,
  snap,
  imageUrl,
  onClick,
}: {
  holding: Holding
  snap: PortfolioSnapshot
  imageUrl?: string
  onClick?: () => void
}) {
  const isLoading = usePortfolioStore((s) => s.isLoading)
  const rawPrice = priceFor(snap, holding.coin.id)
  const showSkeleton = isLoading && rawPrice === undefined
  const value = (rawPrice ?? 0) * holding.amount
  const exchange = findExchange(holding.exchangeId)
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card-bg p-4 text-left transition-colors hover:border-border-hover hover:bg-card-bg-hover"
    >
      <div className="flex items-center gap-2">
        <CoinImage coin={holding.coin} imageUrl={imageUrl} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">{holding.coin.symbol}</span>
          <span className="flex items-center gap-1 text-xs text-text-tertiary">
            <ExchangeBadge exchange={exchange} /> {exchange.name}
          </span>
        </div>
        <div className="ml-auto text-xs">
          <ChangeBadge change={dailyChangeFor(snap, holding.coin.id)} />
        </div>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-secondary">{formatAmount(holding.amount)} {holding.coin.symbol}</span>
        {showSkeleton ? (
          <span className="inline-block h-4 w-16 animate-pulse rounded bg-card-bg-hover" />
        ) : (
          <span className="text-sm font-semibold text-text-primary">{formatCurrency(value, snap.currency)}</span>
        )}
      </div>
    </button>
  )
}
