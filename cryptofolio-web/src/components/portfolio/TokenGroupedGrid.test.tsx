import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokenGroupedGrid } from './TokenGroupedGrid'
import { usePortfolioStore } from '../../store/portfolioStore'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const eth = { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

describe('TokenGroupedGrid', () => {
  beforeEach(() => {
    usePortfolioStore.setState({
      holdings: [
        { id: 'a', coin: btc, amount: 1, exchangeId: 'coinbase' },
        { id: 'b', coin: eth, amount: 5, exchangeId: 'kraken' },
      ],
      prices: {
        bitcoin: { usd: 100, eur: 90, usd_24h_change: 1, eur_24h_change: 1 },
        ethereum: { usd: 10, eur: 9, usd_24h_change: 1, eur_24h_change: 1 },
      },
      currency: 'usd',
      sortMode: 'value',
      coinImages: {},
    })
  })

  it('renders one card per token', () => {
    render(<TokenGroupedGrid />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
  })
})
