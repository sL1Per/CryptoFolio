import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChartSeriesSelector } from './ChartSeriesSelector'

const options = [
  { value: 'total', label: 'Total' },
  { value: 'bitcoin', label: 'BTC' },
  { value: 'ethereum', label: 'ETH' },
]

describe('ChartSeriesSelector', () => {
  it('renders a button per option', () => {
    render(<ChartSeriesSelector options={options} value="total" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Total' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BTC' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ETH' })).toBeInTheDocument()
  })

  it('marks the active option as pressed', () => {
    render(<ChartSeriesSelector options={options} value="bitcoin" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'BTC' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the option value when clicked', async () => {
    const onChange = vi.fn()
    render(<ChartSeriesSelector options={options} value="total" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'ETH' }))
    expect(onChange).toHaveBeenCalledWith('ethereum')
  })
})
