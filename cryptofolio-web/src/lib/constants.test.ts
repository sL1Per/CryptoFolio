import { describe, it, expect, afterEach } from 'vitest'
import {
  POPULAR_COINS,
  EXCHANGES,
  findExchange,
  TIME_RANGE_DAYS,
  normalizeExchangeDomain,
  colorForExchangeName,
  customExchangeId,
  createCustomExchange,
  registerCustomExchangeLookup,
} from './constants'

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

describe('custom exchange helpers', () => {
  afterEach(() => registerCustomExchangeLookup(() => undefined))

  it('normalizeExchangeDomain strips scheme, www, and path', () => {
    expect(normalizeExchangeDomain('https://www.river.com/buy')).toBe('river.com')
    expect(normalizeExchangeDomain('  River.com  ')).toBe('river.com')
    expect(normalizeExchangeDomain('')).toBe('')
  })

  it('colorForExchangeName is deterministic and never the grey fallback', () => {
    expect(colorForExchangeName('River')).toBe(colorForExchangeName('River'))
    expect(colorForExchangeName('River')).toMatch(/^[0-9A-F]{6}$/i)
    expect(colorForExchangeName('River')).not.toBe('666666')
  })

  it('customExchangeId slugifies the name under a custom_ prefix', () => {
    expect(customExchangeId('My Cold Wallet')).toBe('custom_my-cold-wallet')
    expect(customExchangeId('  River!!  ')).toBe('custom_river')
  })

  it('createCustomExchange builds a full Exchange from name + optional website', () => {
    const ex = createCustomExchange('River Financial', 'https://river.com')
    expect(ex).toEqual({
      id: 'custom_river-financial',
      name: 'River Financial',
      color: colorForExchangeName('River Financial'),
      domain: 'river.com',
    })
  })

  it('createCustomExchange tolerates a missing website', () => {
    expect(createCustomExchange('Cold Wallet').domain).toBe('')
  })

  it('findExchange resolves a registered custom exchange before the fallback', () => {
    const river = createCustomExchange('River', 'river.com')
    registerCustomExchangeLookup((id) => (id === river.id ? river : undefined))
    expect(findExchange(river.id)).toEqual(river)
    // built-ins still win, unknown ids still fall back
    expect(findExchange('binance').name).toBe('Binance')
    expect(findExchange('nope').name).toBe('nope')
  })
})
