import type { Currency } from '../types'
import { CURRENCY_META } from './constants'

export function formatCurrency(value: number, currency: Currency): string {
  const { code } = CURRENCY_META[currency]
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value)
}

export function asPercentChange(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function formatAmount(value: number): string {
  return parseFloat(value.toFixed(8)).toString()
}
