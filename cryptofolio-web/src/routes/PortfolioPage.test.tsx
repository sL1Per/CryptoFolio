import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PortfolioPage } from './PortfolioPage'
import { usePortfolioStore } from '../store/portfolioStore'

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
    // tap the holding card (button labelled with the coin symbol/amount)
    await userEvent.click(screen.getByRole('button', { name: /BTC/i }))
    expect(screen.getByRole('dialog', { name: /edit holding/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(usePortfolioStore.getState().holdings).toHaveLength(0)
  })
})
