import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddHoldingModal } from './AddHoldingModal'
import { usePortfolioStore } from '../../store/portfolioStore'

describe('AddHoldingModal', () => {
  beforeEach(() => {
    usePortfolioStore.setState({ holdings: [] })
  })

  it('adds a holding on save', async () => {
    render(<AddHoldingModal open onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Coin'), 'bitcoin')
    await userEvent.type(screen.getByLabelText('Amount'), '1.25')
    await userEvent.selectOptions(screen.getByLabelText('Exchange'), 'kraken')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const h = usePortfolioStore.getState().holdings
    expect(h).toHaveLength(1)
    expect(h[0].coin.id).toBe('bitcoin')
    expect(h[0].amount).toBe(1.25)
    expect(h[0].exchangeId).toBe('kraken')
  })

  it('updates an existing holding in edit mode', async () => {
    const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    const existing = { id: 'h9', coin: btc, amount: 1, exchangeId: 'coinbase' }
    usePortfolioStore.setState({ holdings: [existing] })
    render(<AddHoldingModal open onClose={() => {}} editing={existing} />)
    const amount = screen.getByLabelText('Amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '3')
    await userEvent.selectOptions(screen.getByLabelText('Exchange'), 'kraken')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const h = usePortfolioStore.getState().holdings[0]
    expect(h.amount).toBe(3)
    expect(h.exchangeId).toBe('kraken')
  })
})
