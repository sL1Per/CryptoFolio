import type { PortfolioDataPoint, Currency } from '../../types'
import { chartStats, absoluteChange } from './chartHelpers'
import { formatCurrency } from '../../lib/formatters'

export function ChartStatsBar({ data, currency }: { data: PortfolioDataPoint[]; currency: Currency }) {
  const { start, current, peak, low } = chartStats(data)
  const abs = absoluteChange(data)
  const fmt = (v: number | null) => (v == null ? '—' : formatCurrency(v, currency))

  const cells: { label: string; value: string; className: string }[] = [
    { label: 'START', value: fmt(start), className: 'text-text-secondary' },
    { label: 'CURRENT', value: fmt(current), className: 'text-gold' },
    { label: 'PEAK', value: fmt(peak), className: 'text-text-secondary' },
    { label: 'LOW', value: fmt(low), className: 'text-text-secondary' },
    {
      label: 'ABS. CHANGE',
      value: abs == null ? '—' : formatCurrency(Math.abs(abs), currency),
      className: abs == null ? 'text-text-secondary' : abs >= 0 ? 'text-green' : 'text-red',
    },
  ]

  return (
    <div className="flex items-stretch">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex flex-1 flex-col items-center gap-1 py-3 ${i > 0 ? 'border-l border-border' : ''}`}>
          <span className="font-mono text-[9px] tracking-widest text-text-faint">{c.label}</span>
          <span className={`font-mono text-xs font-semibold ${c.className}`}>{c.value}</span>
        </div>
      ))}
    </div>
  )
}
