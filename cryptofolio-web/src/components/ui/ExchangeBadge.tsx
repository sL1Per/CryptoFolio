import { useEffect, useState } from 'react'
import type { Exchange } from '../../types'
import { exchangeLogoUrl } from '../../types'

export function ExchangeBadge({ exchange, size = 16 }: { exchange: Exchange; size?: number }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [exchange.domain])
  const style = { width: size, height: size }

  if (!exchange.domain || failed) {
    return <span className="inline-block rounded-full" style={{ ...style, background: `#${exchange.color}` }} />
  }
  return (
    <img
      src={exchangeLogoUrl(exchange.domain)}
      alt={exchange.name}
      style={style}
      className="rounded-sm"
      onError={() => setFailed(true)}
    />
  )
}
