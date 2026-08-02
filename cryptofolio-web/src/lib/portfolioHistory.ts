import type { HistoryPoint, PortfolioDataPoint } from '../types'

export function buildPortfolioDataPoints(
  coinHistories: Record<string, HistoryPoint[]>,
  amountByCoin: Record<string, number>,
): PortfolioDataPoint[] {
  const ids = Object.keys(coinHistories)
  if (ids.length === 0) return []

  // Reference axis = timestamps of the longest history.
  let refTimestamps: number[] = []
  for (const id of ids) {
    if (coinHistories[id].length > refTimestamps.length) {
      refTimestamps = coinHistories[id].map((p) => p.ts)
    }
  }
  if (refTimestamps.length === 0) return []

  // Exact-timestamp lookups per coin.
  const lookups: Record<string, Map<number, number>> = {}
  for (const id of ids) {
    lookups[id] = new Map(coinHistories[id].map((p) => [p.ts, p.price]))
  }

  const points: PortfolioDataPoint[] = []
  for (const ts of refTimestamps) {
    let total = 0
    let hasAny = false
    for (const id of ids) {
      const amount = amountByCoin[id]
      if (!amount) continue
      const lk = lookups[id]
      let price = lk.get(ts)
      if (price === undefined) {
        // Nearest timestamp.
        let bestKey: number | undefined
        let bestDist = Infinity
        for (const k of lk.keys()) {
          const d = Math.abs(k - ts)
          if (d < bestDist) { bestDist = d; bestKey = k }
        }
        if (bestKey === undefined) continue
        price = lk.get(bestKey)!
      }
      total += price * amount
      hasAny = true
    }
    if (hasAny) points.push({ date: ts, value: total })
  }

  return points.sort((a, b) => a.date - b.date)
}
