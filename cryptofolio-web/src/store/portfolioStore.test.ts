import { describe, it, expect, beforeEach } from 'vitest'
import { usePortfolioStore } from './portfolioStore'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

describe('portfolioStore', () => {
  beforeEach(() => {
    localStorage.clear()
    usePortfolioStore.setState({ holdings: [], currency: 'usd', groupMode: 'token', sortMode: 'value' })
  })

  it('addHolding appends a holding', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    expect(usePortfolioStore.getState().holdings).toHaveLength(1)
    expect(usePortfolioStore.getState().holdings[0].amount).toBe(2)
  })

  it('updateHolding changes amount + exchange', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    const id = usePortfolioStore.getState().holdings[0].id
    usePortfolioStore.getState().updateHolding(id, 5, 'kraken')
    const h = usePortfolioStore.getState().holdings[0]
    expect(h.amount).toBe(5)
    expect(h.exchangeId).toBe('kraken')
  })

  it('removeHolding deletes by id', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    const id = usePortfolioStore.getState().holdings[0].id
    usePortfolioStore.getState().removeHolding(id)
    expect(usePortfolioStore.getState().holdings).toHaveLength(0)
  })

  it('persists holdings to localStorage', () => {
    usePortfolioStore.getState().addHolding(btc, 2, 'coinbase')
    expect(localStorage.getItem('cryptofolio_holdings_v2')).toContain('bitcoin')
  })
})
