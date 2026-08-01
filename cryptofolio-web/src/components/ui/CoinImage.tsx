import { useState } from 'react'
import type { Coin } from '../../types'

export function CoinImage({ coin, imageUrl, size = 32 }: { coin: Coin; imageUrl?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }

  if (!imageUrl || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-card-bg-hover text-text-secondary font-mono"
        style={{ ...style, fontSize: size * 0.45 }}
      >
        {coin.symbol.charAt(0)}
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      alt={coin.name}
      style={style}
      className="rounded-full"
      onError={() => setFailed(true)}
    />
  )
}
