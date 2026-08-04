import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PortfolioPage } from './PortfolioPage'
import { usePortfolioStore } from '../store/portfolioStore'
// Mock the client so the mount effect does no real network I/O.
vi.mock('../lib/coingecko', () => ({
  RateLimitedError: class RateLimitedError extends Error {},
  fetchPrices: vi.fn().mockResolvedValue({}),
  fetchImages: vi.fn().mockResolvedValue({}),
  fetchCoinHistory: vi.fn().mockResolvedValue({ ok: true, points: [] }),
}))
import * as api from '../lib/coingecko'

describe('PortfolioPage', () => {
  beforeEach(() => {
    usePortfolioStore.setState({ holdings: [], groupMode: 'token', prices: {}, coinImages: {} })
  })

  it('shows an empty state when there are no holdings', () => {
    render(<PortfolioPage />)
    expect(screen.getByText(/no holdings/i)).toBeInTheDocument()
  })

  it('opens the add-holding modal from the Add button', async () => {
    render(<PortfolioPage />)
    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(screen.getByRole('dialog', { name: /add holding/i })).toBeInTheDocument()
  })

  it('opens edit modal from a holding card in All view and can delete', async () => {
    const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    usePortfolioStore.setState({
      holdings: [{ id: 'h1', coin: btc, amount: 2, exchangeId: 'coinbase' }],
      groupMode: 'all',
      prices: {},
      coinImages: {},
      sortMode: 'value',
      currency: 'usd',
    })
    render(<PortfolioPage />)
    // tap the holding card (its label includes the exchange, unlike the chart's bare "BTC" chip)
    await userEvent.click(screen.getByRole('button', { name: /coinbase/i }))
    expect(screen.getByRole('dialog', { name: /edit holding/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(usePortfolioStore.getState().holdings).toHaveLength(0)
  })
})

describe('PortfolioPage live-data wiring', () => {
  it('fetches prices on mount when holdings exist', async () => {
    const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    usePortfolioStore.setState({ holdings: [{ id: 'h', coin: btc, amount: 1, exchangeId: 'coinbase' }], groupMode: 'token', prices: {}, coinImages: {} })
    render(<PortfolioPage />)
    await waitFor(() => expect(api.fetchPrices).toHaveBeenCalled())
  })

  it('refresh button triggers a fetch', async () => {
    const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    usePortfolioStore.setState({ holdings: [{ id: 'h', coin: btc, amount: 1, exchangeId: 'coinbase' }], groupMode: 'token', prices: {}, coinImages: {} })
    render(<PortfolioPage />)
    await waitFor(() => expect(api.fetchPrices).toHaveBeenCalled())
    ;(api.fetchPrices as unknown as { mockClear: () => void }).mockClear()
    await userEvent.click(screen.getByRole('button', { name: /refresh prices/i }))
    await waitFor(() => expect(api.fetchPrices).toHaveBeenCalled())
  })
})
