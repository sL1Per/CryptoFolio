import type {
  AggregatedHolding,
  CoinPrice,
  Currency,
  Exchange,
  Holding,
  SortMode,
} from '../types'
import { findExchange } from '../lib/constants'

export interface PortfolioSnapshot {
  holdings: Holding[]
  prices: Record<string, CoinPrice>
  currency: Currency
  sortMode: SortMode
}

export function priceFor(snap: PortfolioSnapshot, coinId: string): number | undefined {
  const p = snap.prices[coinId]
  if (!p) return undefined
  return (snap.currency === 'usd' ? p.usd : p.eur) ?? undefined
}

export function dailyChangeFor(snap: PortfolioSnapshot, coinId: string): number | undefined {
  const p = snap.prices[coinId]
  if (!p) return undefined
  return (snap.currency === 'usd' ? p.usd_24h_change : p.eur_24h_change) ?? undefined
}

export function totalValue(snap: PortfolioSnapshot): number {
  return snap.holdings.reduce((sum, h) => sum + (priceFor(snap, h.coin.id) ?? 0) * h.amount, 0)
}

export function totalChange24h(snap: PortfolioSnapshot): number {
  return snap.holdings.reduce((sum, h) => {
    const p = priceFor(snap, h.coin.id) ?? 0
    const c = dailyChangeFor(snap, h.coin.id) ?? 0
    return sum + (p * h.amount * c) / 100
  }, 0)
}

function compare(snap: PortfolioSnapshot, aId: string, aAmt: number, aName: string, bId: string, bAmt: number, bName: string): number {
  switch (snap.sortMode) {
    case 'value':
      return (priceFor(snap, bId) ?? 0) * bAmt - (priceFor(snap, aId) ?? 0) * aAmt
    case 'name':
      return aName.localeCompare(bName)
    case 'change':
      return (dailyChangeFor(snap, bId) ?? 0) - (dailyChangeFor(snap, aId) ?? 0)
  }
}

export function sortedHoldings(snap: PortfolioSnapshot): Holding[] {
  return [...snap.holdings].sort((a, b) =>
    compare(snap, a.coin.id, a.amount, a.coin.name, b.coin.id, b.amount, b.coin.name),
  )
}

export function holdingsByToken(snap: PortfolioSnapshot): AggregatedHolding[] {
  const map = new Map<string, AggregatedHolding>()
  for (const h of snap.holdings) {
    const existing = map.get(h.coin.id)
    const entry = { exchange: findExchange(h.exchangeId), amount: h.amount }
    if (existing) {
      existing.totalAmount += h.amount
      existing.breakdown.push(entry)
    } else {
      map.set(h.coin.id, { coin: h.coin, totalAmount: h.amount, breakdown: [entry] })
    }
  }
  return [...map.values()].sort((a, b) =>
    compare(snap, a.coin.id, a.totalAmount, a.coin.name, b.coin.id, b.totalAmount, b.coin.name),
  )
}

export interface ExchangeGroup {
  exchange: Exchange
  holdings: Holding[]
  totalValue: number
}

export function holdingsByExchange(snap: PortfolioSnapshot): ExchangeGroup[] {
  const ids = [...new Set(snap.holdings.map((h) => h.exchangeId))]
  const sorted = sortedHoldings(snap)
  return ids
    .map((exId) => {
      const holdings = sorted.filter((h) => h.exchangeId === exId)
      const total = holdings.reduce((s, h) => s + (priceFor(snap, h.coin.id) ?? 0) * h.amount, 0)
      return { exchange: findExchange(exId), holdings, totalValue: total }
    })
    .sort((a, b) => b.totalValue - a.totalValue)
}
