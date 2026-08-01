import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TotalPortfolioCard } from './TotalPortfolioCard'
import { usePortfolioStore } from '../../store/portfolioStore'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

describe('TotalPortfolioCard', () => {
  beforeEach(() => {
    usePortfolioStore.setState({
      holdings: [{ id: 'a', coin: btc, amount: 2, exchangeId: 'coinbase' }],
      prices: { bitcoin: { usd: 100, eur: 90, usd_24h_change: 5, eur_24h_change: 4 } },
      currency: 'usd',
    })
  })

  it('shows the total portfolio value', () => {
    render(<TotalPortfolioCard />)
    expect(screen.getByText('$200.00')).toBeInTheDocument()
  })
})
