import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsModal } from './SettingsModal'
import { usePortfolioStore } from '../../store/portfolioStore'
import { useThemeStore } from '../../store/themeStore'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
const eth = { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

describe('SettingsModal — delete all config', () => {
  beforeEach(() => {
    localStorage.clear()
    usePortfolioStore.setState({
      holdings: [
        { id: 'x', coin: btc, amount: 2, exchangeId: 'coinbase' },
        { id: 'y', coin: eth, amount: 5, exchangeId: 'kraken' },
      ],
      currency: 'eur',
      groupMode: 'exchange',
      sortMode: 'name',
    })
    useThemeStore.setState({ appearance: 'light' })
  })

  it('hides the confirmation until the delete button is clicked', () => {
    render(<SettingsModal open onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /delete everything/i })).toBeNull()
  })

  it('reveals a confirmation naming the holding count', async () => {
    render(<SettingsModal open onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /delete all data/i }))
    expect(screen.getByText(/2 holdings/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete everything/i })).toBeInTheDocument()
  })

  it('Cancel dismisses the confirmation without deleting', async () => {
    render(<SettingsModal open onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /delete all data/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('button', { name: /delete everything/i })).toBeNull()
    expect(usePortfolioStore.getState().holdings).toHaveLength(2)
  })

  it('confirming wipes holdings, settings, and resets theme to dark', async () => {
    render(<SettingsModal open onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /delete all data/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete everything/i }))
    const s = usePortfolioStore.getState()
    expect(s.holdings).toEqual([])
    expect(s.currency).toBe('usd')
    expect(s.groupMode).toBe('token')
    expect(s.sortMode).toBe('value')
    expect(useThemeStore.getState().appearance).toBe('dark')
  })
})
