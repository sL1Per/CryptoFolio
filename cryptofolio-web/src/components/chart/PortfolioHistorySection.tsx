import { useEffect, useState } from 'react'
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { PortfolioChart } from './PortfolioChart'
import { ChartStatsBar } from './ChartStatsBar'
import { TimeRangePicker } from './TimeRangePicker'
import { periodChangePct } from './chartHelpers'
import { asPercentChange } from '../../lib/formatters'

export function PortfolioHistorySection() {
  const holdings = usePortfolioStore((s) => s.holdings)
  const currency = usePortfolioStore((s) => s.currency)
  const range = usePortfolioStore((s) => s.selectedTimeRange)
  const data = usePortfolioStore((s) => s.historicalData)
  const isLoading = usePortfolioStore((s) => s.isLoadingChart)
  const status = usePortfolioStore((s) => s.chartLoadingStatus)
  const error = usePortfolioStore((s) => s.chartError)
  const isStale = usePortfolioStore((s) => s.chartIsStale)
  const setTimeRange = usePortfolioStore((s) => s.setTimeRange)
  const fetchHistoricalData = usePortfolioStore((s) => s.fetchHistoricalData)

  const [expanded, setExpanded] = useState(true)
  const coinKey = [...new Set(holdings.map((h) => h.coin.id))].sort().join(',')

  useEffect(() => {
    if (expanded && coinKey) fetchHistoricalData()
  }, [expanded, coinKey, range, currency, fetchHistoricalData])

  const pct = periodChangePct(data)
  const positive = (pct ?? 0) >= 0

  return (
    <div className="rounded-xl border border-border bg-card-bg">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-text-tertiary">PORTFOLIO HISTORY</span>
          {pct != null && (
            <span className={`font-mono text-sm font-bold ${positive ? 'text-green' : 'text-red'}`}>
              {range} {asPercentChange(pct)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status ? (
            <span className="font-mono text-[9px] text-text-faint">{status}</span>
          ) : isStale ? (
            <span className="font-mono text-[9px] text-text-faint">cached — tap ↻ to refresh</span>
          ) : null}
          <button
            onClick={() => fetchHistoricalData(true)} disabled={isLoading}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center text-gold disabled:text-text-faint" aria-label="Refresh chart"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)} className="flex min-h-[40px] min-w-[40px] items-center justify-center text-text-tertiary hover:text-text-primary"
            aria-label={expanded ? 'Hide chart' : 'Show chart'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="relative h-64 border-t border-border">
            {data.length > 0 ? (
              <>
                <PortfolioChart data={data} range={range} currency={currency} />
                {isStale && !isLoading && (
                  <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-[var(--gold-border)] bg-[var(--gold-card-bg)] px-3 py-1 font-mono text-[10px] text-gold">
                    Showing cached data — tap ↻ to refresh
                  </div>
                )}
              </>
            ) : isLoading ? (
              <div className="flex h-full items-center justify-center font-mono text-xs text-text-tertiary">Fetching chart data…</div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <span className="font-mono text-xs text-text-tertiary">{error}</span>
                <button onClick={() => fetchHistoricalData(true)} className="font-mono text-xs text-gold">Retry</button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-xs text-text-tertiary">
                {holdings.length === 0 ? 'Add holdings to see your chart' : 'No chart data yet'}
              </div>
            )}
          </div>
          <div className="border-t border-border">
            <ChartStatsBar data={data} currency={currency} />
          </div>
          <div className="flex justify-center border-t border-border px-5 py-3">
            <TimeRangePicker value={range} onChange={setTimeRange} />
          </div>
        </>
      )}
    </div>
  )
}
