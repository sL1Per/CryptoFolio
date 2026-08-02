import { describe, it, expect } from 'vitest'
import { buildPortfolioDataPoints } from './portfolioHistory'
import type { HistoryPoint } from '../types'

const pts = (...pairs: [number, number][]): HistoryPoint[] => pairs.map(([ts, price]) => ({ ts, price }))

describe('buildPortfolioDataPoints', () => {
  it('returns empty for no histories', () => {
    expect(buildPortfolioDataPoints({}, { bitcoin: 1 })).toEqual([])
  })

  it('sums price*amount per timestamp across coins', () => {
    const histories = { bitcoin: pts([1000, 10], [2000, 20]), ethereum: pts([1000, 1], [2000, 2]) }
    const out = buildPortfolioDataPoints(histories, { bitcoin: 2, ethereum: 3 })
    expect(out).toEqual([
      { date: 1000, value: 2 * 10 + 3 * 1 },
      { date: 2000, value: 2 * 20 + 3 * 2 },
    ])
  })

  it('uses the longest history as the reference axis and nearest-timestamp for shorter ones', () => {
    // bitcoin has 3 points (reference); ethereum has 1 point → nearest for every ref ts
    const histories = { bitcoin: pts([1000, 10], [2000, 20], [3000, 30]), ethereum: pts([2100, 5]) }
    const out = buildPortfolioDataPoints(histories, { bitcoin: 1, ethereum: 1 })
    expect(out.map((p) => p.date)).toEqual([1000, 2000, 3000])
    // ethereum only point (5) is nearest for all three ref timestamps
    expect(out).toEqual([
      { date: 1000, value: 10 + 5 },
      { date: 2000, value: 20 + 5 },
      { date: 3000, value: 30 + 5 },
    ])
  })

  it('ignores coins with no amount held and returns sorted output', () => {
    const histories = { bitcoin: pts([2000, 20], [1000, 10]) }
    const out = buildPortfolioDataPoints(histories, { bitcoin: 1, ethereum: 4 })
    expect(out).toEqual([
      { date: 1000, value: 10 },
      { date: 2000, value: 20 },
    ])
  })
})
