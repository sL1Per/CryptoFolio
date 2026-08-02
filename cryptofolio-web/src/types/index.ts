export interface Coin {
  id: string
  symbol: string
  name: string
}

export interface Exchange {
  id: string
  name: string
  color: string // hex without '#'
  domain: string
}

export interface Holding {
  id: string
  coin: Coin
  amount: number
  exchangeId: string
}

export interface AggregatedHolding {
  coin: Coin
  totalAmount: number
  breakdown: Array<{ exchange: Exchange; amount: number }>
}

export interface CoinPrice {
  usd: number | null
  eur: number | null
  usd_24h_change: number | null
  eur_24h_change: number | null
}

export interface PortfolioDataPoint {
  date: number // ms epoch
  value: number
}

export interface HistoryPoint {
  ts: number // ms epoch
  price: number
}

export type Currency = 'usd' | 'eur'
export type TimeRange = '7D' | '1M' | '1Y' | '5Y'
export type GroupMode = 'token' | 'exchange' | 'all'
export type SortMode = 'value' | 'name' | 'change'
export type AppearanceMode = 'dark' | 'light' | 'system'

export function newHolding(coin: Coin, amount: number, exchangeId: string): Holding {
  return { id: crypto.randomUUID(), coin, amount, exchangeId }
}

export function exchangeLogoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}
