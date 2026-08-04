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
    <div className="grid grid-cols-2 sm:flex sm:items-stretch">
      {cells.map((c, i) => {
        const isLast = i === cells.length - 1
        return (
          <div
            key={c.label}
            className={[
              'flex flex-col items-center gap-1 py-3',
              'sm:flex-1',
              // mobile grid dividers: top border on rows after the first, left border on right column
              i >= 2 ? 'border-t border-border' : '',
              i % 2 === 1 ? 'border-l border-border' : '',
              isLast ? 'col-span-2 sm:col-span-1' : '',
              // desktop: left divider on every cell except the first (restores original look)
              i > 0 ? 'sm:border-l sm:border-border' : 'sm:border-l-0',
              // the col-spanning last cell must not carry a mobile left border
              isLast ? 'border-l-0 sm:border-l' : '',
            ].join(' ')}
          >
            <span className="font-mono text-[9px] tracking-widest text-text-faint">{c.label}</span>
            <span className={`font-mono text-xs font-semibold ${c.className}`}>{c.value}</span>
          </div>
        )
      })}
    </div>
  )
}
