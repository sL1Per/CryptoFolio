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
})
