import { describe, it, expect } from 'vitest'
import { newHolding, exchangeLogoUrl } from './index'

describe('newHolding', () => {
  it('assigns a uuid and copies fields', () => {
    const coin = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    const h = newHolding(coin, 1.5, 'coinbase')
    expect(h.id).toMatch(/[0-9a-f-]{36}/)
    expect(h.coin).toEqual(coin)
    expect(h.amount).toBe(1.5)
    expect(h.exchangeId).toBe('coinbase')
  })
})

describe('exchangeLogoUrl', () => {
  it('builds a Google favicon CDN url', () => {
    expect(exchangeLogoUrl('coinbase.com')).toBe(
      'https://www.google.com/s2/favicons?domain=coinbase.com&sz=64',
    )
  })
})
