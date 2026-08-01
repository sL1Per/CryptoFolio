import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoinImage } from './CoinImage'

const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

describe('CoinImage', () => {
  it('shows the image when a url is provided', () => {
    render(<CoinImage coin={btc} imageUrl="https://example.com/btc.png" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/btc.png')
  })
  it('falls back to the first letter on image error', () => {
    render(<CoinImage coin={btc} imageUrl="https://bad/url.png" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('B')).toBeInTheDocument()
  })
  it('shows the letter avatar when no url is provided', () => {
    render(<CoinImage coin={btc} />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })
  it('clears the fallback when imageUrl prop changes', () => {
    const { rerender } = render(<CoinImage coin={btc} imageUrl="https://bad/url.png" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('B')).toBeInTheDocument()
    rerender(<CoinImage coin={btc} imageUrl="https://good/url.png" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://good/url.png')
  })
})
