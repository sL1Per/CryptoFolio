import { describe, it, expect } from 'vitest'
import { POPULAR_COINS, EXCHANGES, findExchange, TIME_RANGE_DAYS } from './constants'

describe('constants', () => {
  it('has exactly 20 popular coins with bitcoin first', () => {
    expect(POPULAR_COINS).toHaveLength(20)
    expect(POPULAR_COINS[0]).toEqual({ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' })
  })

  it('has exactly 13 exchanges including the fallback', () => {
    expect(EXCHANGES).toHaveLength(13)
    expect(EXCHANGES.map((e) => e.id)).toContain('other')
  })

  it('findExchange returns a match or a synthesized fallback', () => {
    expect(findExchange('binance').name).toBe('Binance')
    expect(findExchange('unknown-xyz')).toEqual({
      id: 'unknown-xyz',
      name: 'unknown-xyz',
      color: '666666',
      domain: '',
    })
  })

  it('maps time ranges to CoinGecko day counts', () => {
    expect(TIME_RANGE_DAYS).toEqual({ '7D': 7, '1M': 30, '1Y': 365, '5Y': 1825 })
  })
})
