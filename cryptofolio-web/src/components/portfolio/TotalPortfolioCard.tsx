import { usePortfolioStore } from '../../store/portfolioStore'
import { totalValue, totalChange24h, type PortfolioSnapshot } from '../../store/selectors'
import { formatCurrency, asPercentChange } from '../../lib/formatters'

export function TotalPortfolioCard() {
  const snap = usePortfolioStore(
    (s): PortfolioSnapshot => ({
      holdings: s.holdings,
      prices: s.prices,
      currency: s.currency,
      sortMode: s.sortMode,
    }),
  )
  const total = totalValue(snap)
  const change = totalChange24h(snap)
  const pct = total - change !== 0 ? (change / (total - change)) * 100 : 0
  const up = change >= 0

  return (
    <div className="rounded-2xl border border-[var(--gold-border)] bg-[var(--gold-card-bg)] p-5 sm:p-6">
      <div className="text-xs uppercase tracking-wider text-text-secondary">Total Portfolio Value</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums break-words text-text-primary sm:text-4xl">{formatCurrency(total, snap.currency)}</div>
      <div className={`mt-1 text-sm ${up ? 'text-green' : 'text-red'}`}>
        {up ? '+' : ''}
        {formatCurrency(change, snap.currency)} ({asPercentChange(pct)}) 24h
      </div>
    </div>
  )
}
