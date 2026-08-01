import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlBar } from './ControlBar'
import { usePortfolioStore } from '../../store/portfolioStore'

describe('ControlBar', () => {
  beforeEach(() => {
    usePortfolioStore.setState({ groupMode: 'token', sortMode: 'value', currency: 'usd' })
  })

  it('switches group mode on click', async () => {
    render(<ControlBar />)
    await userEvent.click(screen.getByRole('button', { name: 'Exchange' }))
    expect(usePortfolioStore.getState().groupMode).toBe('exchange')
  })

  it('switches currency on click', async () => {
    render(<ControlBar />)
    await userEvent.click(screen.getByRole('button', { name: 'EUR' }))
    expect(usePortfolioStore.getState().currency).toBe('eur')
  })
})
