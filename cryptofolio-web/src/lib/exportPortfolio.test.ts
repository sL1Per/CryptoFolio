import { describe, it, expect } from 'vitest'
import { buildPortfolioExport, exportFilename, parsePortfolioImport } from './exportPortfolio'
import type { Exchange, Holding } from '../types'

const holdings: Holding[] = [
  { id: 'a1', coin: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }, amount: 0.5, exchangeId: 'kraken' },
  { id: 'b2', coin: { id: 'ethereum', symbol: 'eth', name: 'Ethereum' }, amount: 3, exchangeId: 'coinbase' },
]

const customExchanges: Exchange[] = [
  { id: 'custom_river', name: 'River', color: 'E8831D', domain: 'river.com' },
]

describe('buildPortfolioExport', () => {
  it('wraps holdings and custom exchanges with metadata, currency, and an ISO timestamp', () => {
    const now = new Date('2026-08-03T12:34:56.000Z')
    const out = buildPortfolioExport(holdings, 'eur', customExchanges, now)
    expect(out).toEqual({
      app: 'CryptoFolio',
      version: 2,
      exportedAt: '2026-08-03T12:34:56.000Z',
      currency: 'eur',
      holdings,
      customExchanges,
    })
  })

  it('defaults custom exchanges to an empty array', () => {
    const out = buildPortfolioExport(holdings, 'usd')
    expect(out.customExchanges).toEqual([])
  })

  it('round-trips through JSON without loss', () => {
    const out = buildPortfolioExport(holdings, 'usd', customExchanges, new Date('2026-08-03T00:00:00.000Z'))
    expect(JSON.parse(JSON.stringify(out))).toEqual(out)
  })

  it('includes the API key when one is set', () => {
    const out = buildPortfolioExport(holdings, 'usd', customExchanges, new Date(), 'CG-secret')
    expect(out.apiKey).toBe('CG-secret')
  })

  it('omits the API key field when empty', () => {
    const out = buildPortfolioExport(holdings, 'usd', customExchanges, new Date(), '')
    expect('apiKey' in out).toBe(false)
  })
})

describe('exportFilename', () => {
  it('date-stamps the filename', () => {
    expect(exportFilename(new Date('2026-08-03T23:59:00.000Z'))).toBe('cryptofolio-portfolio-2026-08-03.json')
  })
})

describe('parsePortfolioImport', () => {
  it('round-trips an exported file including custom exchanges', () => {
    const json = JSON.stringify(buildPortfolioExport(holdings, 'eur', customExchanges, new Date()))
    const parsed = parsePortfolioImport(json)
    expect(parsed.holdings).toEqual(holdings)
    expect(parsed.currency).toBe('eur')
    expect(parsed.customExchanges).toEqual(customExchanges)
  })

  it('round-trips the API key when present', () => {
    const json = JSON.stringify(buildPortfolioExport(holdings, 'usd', customExchanges, new Date(), 'CG-secret'))
    expect(parsePortfolioImport(json).apiKey).toBe('CG-secret')
  })

  it('leaves apiKey undefined when the file has none', () => {
    const json = JSON.stringify(buildPortfolioExport(holdings, 'usd'))
    expect(parsePortfolioImport(json).apiKey).toBeUndefined()
  })

  it('tolerates a v1 file with no custom exchanges', () => {
    const json = JSON.stringify({ version: 1, holdings, currency: 'usd' })
    const parsed = parsePortfolioImport(json)
    expect(parsed.holdings).toEqual(holdings)
    expect(parsed.customExchanges).toBeUndefined()
  })

  it('rejects a malformed custom exchange', () => {
    const json = JSON.stringify({ holdings, customExchanges: [{ id: 'custom_x' }] })
    expect(() => parsePortfolioImport(json)).toThrow(/exchange/i)
  })

  it('regenerates a missing holding id', () => {
    const json = JSON.stringify({
      holdings: [{ coin: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }, amount: 1, exchangeId: 'kraken' }],
    })
    const parsed = parsePortfolioImport(json)
    expect(typeof parsed.holdings[0].id).toBe('string')
    expect(parsed.holdings[0].id.length).toBeGreaterThan(0)
  })

  it('ignores an unknown currency', () => {
    const json = JSON.stringify({ currency: 'gbp', holdings: [] })
    expect(parsePortfolioImport(json).currency).toBeUndefined()
  })

  it('rejects invalid JSON', () => {
    expect(() => parsePortfolioImport('{not json')).toThrow(/valid JSON/)
  })

  it('rejects a file with no holdings array', () => {
    expect(() => parsePortfolioImport('{"foo":1}')).toThrow(/No holdings/)
  })

  it('rejects a holding with a non-numeric amount', () => {
    const json = JSON.stringify({
      holdings: [{ coin: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }, amount: 'lots', exchangeId: 'kraken' }],
    })
    expect(() => parsePortfolioImport(json)).toThrow(/invalid amount/)
  })

  it('rejects a holding missing coin data', () => {
    const json = JSON.stringify({ holdings: [{ amount: 1, exchangeId: 'kraken' }] })
    expect(() => parsePortfolioImport(json)).toThrow(/missing coin data/)
  })
})
