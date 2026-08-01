import type { Coin, Exchange, TimeRange } from '../types'

export const POPULAR_COINS: Coin[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos' },
  { id: 'stellar', symbol: 'XLM', name: 'Stellar' },
  { id: 'monero', symbol: 'XMR', name: 'Monero' },
  { id: 'tron', symbol: 'TRX', name: 'TRON' },
  { id: 'the-sandbox', symbol: 'SAND', name: 'The Sandbox' },
  { id: 'decentraland', symbol: 'MANA', name: 'Decentraland' },
  { id: 'aave', symbol: 'AAVE', name: 'Aave' },
]

export const EXCHANGES: Exchange[] = [
  { id: 'coinbase', name: 'Coinbase', color: '0052FF', domain: 'coinbase.com' },
  { id: 'binance', name: 'Binance', color: 'F0B90B', domain: 'binance.com' },
  { id: 'kraken', name: 'Kraken', color: '5741D9', domain: 'kraken.com' },
  { id: 'bybit', name: 'Bybit', color: 'F7A600', domain: 'bybit.com' },
  { id: 'okx', name: 'OKX', color: 'BBBBBB', domain: 'okx.com' },
  { id: 'kucoin', name: 'KuCoin', color: '00A3FF', domain: 'kucoin.com' },
  { id: 'gemini', name: 'Gemini', color: '00DCFA', domain: 'gemini.com' },
  { id: 'bitfinex', name: 'Bitfinex', color: '16B157', domain: 'bitfinex.com' },
  { id: 'bitstamp', name: 'Bitstamp', color: '00A850', domain: 'bitstamp.net' },
  { id: 'crypto_com', name: 'Crypto.com', color: '1199FA', domain: 'crypto.com' },
  { id: 'wallet', name: 'Hardware Wallet', color: 'FF6B35', domain: 'ledger.com' },
  { id: 'metamask', name: 'MetaMask', color: 'E8831D', domain: 'metamask.io' },
  { id: 'other', name: 'Other', color: '666666', domain: '' },
]

export function findExchange(id: string): Exchange {
  return EXCHANGES.find((e) => e.id === id) ?? { id, name: id, color: '666666', domain: '' }
}

export const CURRENCY_META = {
  usd: { code: 'USD', symbol: '$' },
  eur: { code: 'EUR', symbol: '€' },
} as const

export const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '7D': 7,
  '1M': 30,
  '1Y': 365,
  '5Y': 1825,
}
