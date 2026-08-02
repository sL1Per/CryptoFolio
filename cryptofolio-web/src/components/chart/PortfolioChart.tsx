import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { PortfolioDataPoint, TimeRange, Currency } from '../../types'
import { periodChangePct, axisCurrency, xTickLabel } from './chartHelpers'
import { CURRENCY_META } from '../../lib/constants'

export function PortfolioChart({
  data, range, currency,
}: { data: PortfolioDataPoint[]; range: TimeRange; currency: Currency }) {
  const positive = (periodChangePct(data) ?? 0) >= 0
  const color = positive ? 'var(--gold)' : 'var(--red)'
  const symbol = CURRENCY_META[currency].symbol
  const gradientId = 'chartFill'

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--subtle-border)" vertical={false} />
        <XAxis
          dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']}
          tickFormatter={(ms: number) => xTickLabel(ms, range)}
          tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-tertiary)' }}
          stroke="var(--subtle-border)"
          minTickGap={40}
          interval="preserveStartEnd"
        />
        <YAxis
          orientation="left" domain={['auto', 'auto']} width={56}
          tickFormatter={(v: number) => axisCurrency(v, symbol)}
          tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-tertiary)' }}
          stroke="var(--subtle-border)"
        />
        <Area
          type="monotone" dataKey="value" stroke={color} strokeWidth={2.5}
          fill={`url(#${gradientId})`} isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
