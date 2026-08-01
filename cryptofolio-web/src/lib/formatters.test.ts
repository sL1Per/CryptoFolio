import { describe, it, expect } from 'vitest'
import { formatCurrency, asPercentChange, formatAmount } from './formatters'

describe('formatCurrency', () => {
  it('uses 2 fraction digits for values >= 1', () => {
    expect(formatCurrency(1234.5, 'usd')).toBe('$1,234.50')
  })
  it('uses up to 6 fraction digits for values < 1', () => {
    expect(formatCurrency(0.0025, 'usd')).toBe('$0.0025')
  })
  it('formats euro', () => {
    expect(formatCurrency(10, 'eur')).toBe('€10.00')
  })
})

describe('asPercentChange', () => {
  it('prefixes + for non-negative', () => {
    expect(asPercentChange(3.456)).toBe('+3.46%')
  })
  it('keeps - for negative', () => {
    expect(asPercentChange(-2)).toBe('-2.00%')
  })
})

describe('formatAmount', () => {
  it('trims trailing zeros', () => {
    expect(formatAmount(1.5)).toBe('1.5')
    expect(formatAmount(2)).toBe('2')
  })
})
