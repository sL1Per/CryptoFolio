import { describe, it, expect } from 'vitest'
import { validateHistoryRequest, historyTransform } from './[id]'

describe('validateHistoryRequest', () => {
  it('accepts a valid coin id, days, and currency', () => {
    expect(validateHistoryRequest('bitcoin', '7', 'usd')).toEqual({ id: 'bitcoin', days: 7, vs: 'usd' })
    expect(validateHistoryRequest('avalanche-2', '1825', 'eur')).toEqual({ id: 'avalanche-2', days: 1825, vs: 'eur' })
  })
  it('rejects a missing or malformed id', () => {
    expect(validateHistoryRequest(undefined, '7', 'usd')).toBeNull()
    expect(validateHistoryRequest('', '7', 'usd')).toBeNull()
    expect(validateHistoryRequest('bad id!', '7', 'usd')).toBeNull()
    expect(validateHistoryRequest('../etc', '7', 'usd')).toBeNull()
  })
  it('rejects a days value that is not one of the four allowed', () => {
    expect(validateHistoryRequest('bitcoin', '10', 'usd')).toBeNull()
    expect(validateHistoryRequest('bitcoin', null, 'usd')).toBeNull()
  })
  it('rejects a currency other than usd/eur', () => {
    expect(validateHistoryRequest('bitcoin', '7', 'gbp')).toBeNull()
    expect(validateHistoryRequest('bitcoin', '7', null)).toBeNull()
  })
})

describe('historyTransform', () => {
  it('extracts prices from a valid market_chart payload', () => {
    const json = { prices: [[1000, 1.5], [2000, 2.5]], market_caps: [], total_volumes: [] }
    expect(historyTransform(json)).toEqual({ prices: [[1000, 1.5], [2000, 2.5]] })
  })
  it('returns empty prices for malformed payloads', () => {
    expect(historyTransform(null)).toEqual({ prices: [] })
    expect(historyTransform({})).toEqual({ prices: [] })
    expect(historyTransform({ prices: 'nope' })).toEqual({ prices: [] })
    expect(historyTransform({ prices: [[1000], ['a', 'b'], [1, 2]] })).toEqual({ prices: [[1, 2]] })
  })
})
