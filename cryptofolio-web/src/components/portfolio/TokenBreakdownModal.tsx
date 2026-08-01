import type { AggregatedHolding } from '../../types'
import type { PortfolioSnapshot } from '../../store/selectors'
import { priceFor } from '../../store/selectors'
import { formatCurrency, formatAmount } from '../../lib/formatters'
import { ExchangeBadge } from '../ui/ExchangeBadge'
import { Modal } from '../ui/Modal'

export function TokenBreakdownModal({
  agg,
  snap,
  open,
  onClose,
}: {
  agg: AggregatedHolding | null
  snap: PortfolioSnapshot
  open: boolean
  onClose: () => void
}) {
  if (!agg) return null
  const price = priceFor(snap, agg.coin.id) ?? 0
  return (
    <Modal open={open} onClose={onClose} title={`${agg.coin.name} breakdown`}>
      <div className="flex flex-col gap-2">
        {agg.breakdown.map((b, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-subtle-border bg-row-bg p-3">
            <span className="flex items-center gap-2 text-sm text-text-primary">
              <ExchangeBadge exchange={b.exchange} /> {b.exchange.name}
            </span>
            <span className="text-xs text-text-secondary">{formatAmount(b.amount)} {agg.coin.symbol}</span>
            <span className="text-sm font-semibold text-text-primary">{formatCurrency(price * b.amount, snap.currency)}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
