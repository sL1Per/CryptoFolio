import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TokenCard } from './TokenCard'
import type { PortfolioSnapshot } from '../../store/selectors'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const snap: PortfolioSnapshot = {
  currency: 'usd',
  sortMode: 'value',
  holdings: [],
  prices: { bitcoin: { usd: 100, eur: 90, usd_24h_change: 5, eur_24h_change: 4 } },
}
const agg = {
  coin: btc,
  totalAmount: 2,
  breakdown: [{ exchange: { id: 'coinbase', name: 'Coinbase', color: '0052FF', domain: 'coinbase.com' }, amount: 2 }],
}

describe('TokenCard', () => {
  it('shows symbol and value and fires onClick', async () => {
    let clicked = false
    render(<TokenCard agg={agg} snap={snap} onClick={() => (clicked = true)} />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('$200.00')).toBeInTheDocument()
    await userEvent.click(screen.getByText('BTC'))
    expect(clicked).toBe(true)
  })
})
