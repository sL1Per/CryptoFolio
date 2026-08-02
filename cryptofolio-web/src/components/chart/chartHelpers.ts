import type { PortfolioDataPoint, TimeRange } from '../../types'

export function periodChangePct(data: PortfolioDataPoint[]): number | null {
  if (data.length < 2) return null
  const first = data[0].value
  const last = data[data.length - 1].value
  if (first <= 0) return null
  return ((last - first) / first) * 100
}

export function absoluteChange(data: PortfolioDataPoint[]): number | null {
  if (data.length < 2) return null
  return data[data.length - 1].value - data[0].value
}

export function chartStats(data: PortfolioDataPoint[]): {
  start: number | null; current: number | null; peak: number | null; low: number | null
} {
  if (data.length === 0) return { start: null, current: null, peak: null, low: null }
  const values = data.map((p) => p.value)
  return {
    start: data[0].value,
    current: data[data.length - 1].value,
    peak: Math.max(...values),
    low: Math.min(...values),
  }
}

export function axisCurrency(value: number, symbol: string): string {
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}K`
  return `${symbol}${value.toFixed(0)}`
}

export function xTickLabel(ms: number, range: TimeRange): string {
  const date = new Date(ms)
  switch (range) {
    case '7D': return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
    case '1M': return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case '1Y': return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    case '5Y': return String(date.getFullYear())
  }
}
