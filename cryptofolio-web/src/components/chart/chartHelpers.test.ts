import { describe, it, expect } from 'vitest'
import { periodChangePct, absoluteChange, chartStats, axisCurrency, xTickLabel } from './chartHelpers'
import type { PortfolioDataPoint } from '../../types'

const d = (...vals: number[]): PortfolioDataPoint[] => vals.map((value, i) => ({ date: 1000 + i, value }))

describe('periodChangePct / absoluteChange', () => {
  it('computes percent and absolute change', () => {
    expect(periodChangePct(d(100, 150))).toBeCloseTo(50)
    expect(absoluteChange(d(100, 150))).toBe(50)
  })
  it('returns null for insufficient or zero-base data', () => {
    expect(periodChangePct(d(100))).toBeNull()
    expect(periodChangePct(d(0, 10))).toBeNull()
    expect(absoluteChange([])).toBeNull()
  })
})

describe('chartStats', () => {
  it('reports start/current/peak/low', () => {
    expect(chartStats(d(100, 300, 50, 200))).toEqual({ start: 100, current: 200, peak: 300, low: 50 })
  })
  it('is all null for empty data', () => {
    expect(chartStats([])).toEqual({ start: null, current: null, peak: null, low: null })
  })
})

describe('axisCurrency', () => {
  it('compacts thousands and millions', () => {
    expect(axisCurrency(950, '$')).toBe('$950')
    expect(axisCurrency(12_500, '$')).toBe('$13K')
    expect(axisCurrency(2_300_000, '€')).toBe('€2.3M')
  })
})

describe('xTickLabel', () => {
  it('formats per range without throwing', () => {
    const ms = Date.UTC(2026, 7, 4) // 2026-08-04
    expect(xTickLabel(ms, '5Y')).toBe('2026')
    expect(typeof xTickLabel(ms, '7D')).toBe('string')
    expect(typeof xTickLabel(ms, '1M')).toBe('string')
    expect(typeof xTickLabel(ms, '1Y')).toBe('string')
  })
})
