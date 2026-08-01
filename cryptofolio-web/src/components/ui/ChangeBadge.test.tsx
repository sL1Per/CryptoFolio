import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChangeBadge } from './ChangeBadge'

describe('ChangeBadge', () => {
  it('renders a dash when change is undefined', () => {
    render(<ChangeBadge change={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
  it('renders +2.00% for positive change', () => {
    render(<ChangeBadge change={2} />)
    expect(screen.getByText('+2.00%')).toBeInTheDocument()
  })
})
