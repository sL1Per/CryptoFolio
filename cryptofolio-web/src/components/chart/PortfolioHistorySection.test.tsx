import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PortfolioHistorySection } from './PortfolioHistorySection'
import { usePortfolioStore } from '../../store/portfolioStore'
import { formatCurrency } from '../../lib/formatters'
import type { CoinPrice } from '../../types'

// Isolate the wiring from recharts (no ResizeObserver in jsdom).
vi.mock('./PortfolioChart', () => ({ PortfolioChart: () => <div data-testid="chart" /> }))

const price = (usd: number): CoinPrice => ({ usd, eur: usd, usd_24h_change: 0, eur_24h_change: 0 })

const currentCell = () => screen.getByText('CURRENT').parentElement as HTMLElement

function seed() {
  usePortfolioStore.setState({
    holdings: [
      { id: 'h1', coin: { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }, amount: 2, exchangeId: 'coinbase' },
      { id: 'h2', coin: { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }, amount: 1, exchangeId: 'kraken' },
    ],
    currency: 'usd',
    selectedTimeRange: '7D',
    prices: { bitcoin: price(30000), ethereum: price(2000) },
    historicalData: [{ date: 1000, value: 900 }, { date: 2000, value: 1000 }], // Total
    chartCache: {
      'bitcoin|usd|7D': { coinId: 'bitcoin', currency: 'usd', range: '7D', fetchedAt: Date.now(), points: [{ ts: 1000, price: 10 }, { ts: 2000, price: 20 }] },
      'ethereum|usd|7D': { coinId: 'ethereum', currency: 'usd', range: '7D', fetchedAt: Date.now(), points: [{ ts: 1000, price: 5 }, { ts: 2000, price: 9 }] },
    },
    isLoadingChart: false,
    chartError: null,
    chartLoadingStatus: '',
    chartIsStale: false,
    fetchHistoricalData: vi.fn(async () => {}),
  })
}

describe('PortfolioHistorySection — per-token selector', () => {
  beforeEach(() => {
    localStorage.clear()
    seed()
  })

  it('shows Total plus a chip per held token, biggest holding first', () => {
    render(<PortfolioHistorySection />)
    expect(screen.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'BTC' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ETH' })).toBeInTheDocument()
  })

  it('defaults to the aggregate Total series', () => {
    render(<PortfolioHistorySection />)
    expect(currentCell()).toHaveTextContent(formatCurrency(1000, 'usd'))
  })

  it('switches the series to the selected token (value = price × amount)', async () => {
    render(<PortfolioHistorySection />)
    await userEvent.click(screen.getByRole('button', { name: 'BTC' }))
    // BTC amount 2 × last price 20 = 40
    expect(currentCell()).toHaveTextContent(formatCurrency(40, 'usd'))
    expect(screen.getByRole('button', { name: 'BTC' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('resets to Total when the selected token leaves the portfolio', async () => {
    render(<PortfolioHistorySection />)
    await userEvent.click(screen.getByRole('button', { name: 'BTC' }))
    expect(currentCell()).toHaveTextContent(formatCurrency(40, 'usd'))

    act(() => {
      usePortfolioStore.setState({
        holdings: [{ id: 'h2', coin: { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }, amount: 1, exchangeId: 'kraken' }],
      })
    })

    expect(screen.queryByRole('button', { name: 'BTC' })).toBeNull()
    expect(currentCell()).toHaveTextContent(formatCurrency(1000, 'usd')) // back to Total
  })
})
