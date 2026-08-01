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
})
