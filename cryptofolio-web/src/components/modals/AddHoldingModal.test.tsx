import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddHoldingModal } from './AddHoldingModal'
import { usePortfolioStore } from '../../store/portfolioStore'

describe('AddHoldingModal', () => {
  beforeEach(() => {
    usePortfolioStore.setState({ holdings: [], customExchanges: {} })
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

  it('adds a custom exchange inline and uses it on the new holding', async () => {
    render(<AddHoldingModal open onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Amount'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Exchange'), '__add_custom__')
    await userEvent.type(screen.getByLabelText('Custom exchange name'), 'River')
    await userEvent.type(screen.getByLabelText('Custom exchange website'), 'river.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    // form collapses and the new exchange becomes the selection
    expect(screen.queryByLabelText('Custom exchange name')).toBeNull()
    expect(usePortfolioStore.getState().customExchanges['custom_river']).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const h = usePortfolioStore.getState().holdings
    expect(h).toHaveLength(1)
    expect(h[0].exchangeId).toBe('custom_river')
  })

  it('does not add a custom exchange when the name is blank', async () => {
    render(<AddHoldingModal open onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Exchange'), '__add_custom__')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(usePortfolioStore.getState().customExchanges).toEqual({})
    // form stays open for correction
    expect(screen.getByLabelText('Custom exchange name')).toBeInTheDocument()
  })

  it('Cancel dismisses the custom-exchange form', async () => {
    render(<AddHoldingModal open onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Exchange'), '__add_custom__')
    expect(screen.getByLabelText('Custom exchange name')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Custom exchange name')).toBeNull()
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
