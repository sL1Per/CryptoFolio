import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartStatsBar } from './ChartStatsBar'
import type { PortfolioDataPoint } from '../../types'

const data: PortfolioDataPoint[] = [
  { date: 1000, value: 100 }, { date: 2000, value: 300 }, { date: 3000, value: 200 },
]

describe('ChartStatsBar', () => {
  it('renders the five labeled stats with formatted values', () => {
    render(<ChartStatsBar data={data} currency="usd" />)
    expect(screen.getByText('START')).toBeInTheDocument()
    expect(screen.getByText('CURRENT')).toBeInTheDocument()
    expect(screen.getByText('PEAK')).toBeInTheDocument()
    expect(screen.getByText('LOW')).toBeInTheDocument()
    expect(screen.getByText('ABS. CHANGE')).toBeInTheDocument()
    expect(screen.getByText('$300.00')).toBeInTheDocument() // peak
    expect(screen.getByText('$200.00')).toBeInTheDocument() // current
    expect(screen.getAllByText('$100.00')).toHaveLength(3) // start, low, abs change
  })
  it('shows dashes when there is no data', () => {
    render(<ChartStatsBar data={[]} currency="usd" />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)
  })
})
